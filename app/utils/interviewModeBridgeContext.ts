import type {
  InterviewDialogueMessage,
  InterviewStateResponse,
  InterviewTrainingMode,
} from '@/shared/dto';

export function buildInterviewModeBridgeContext(
  state: InterviewStateResponse | null | undefined
): string {
  const currentTurn = state?.currentTurn;
  if (!state || !currentTurn) return '';

  const previousQuestions = state.turns
    .filter(
      (turn) =>
        turn.kind === 'main' &&
        turn.id !== currentTurn.id &&
        turn.index < currentTurn.index
    )
    .sort((left, right) => left.index - right.index)
    .map((turn) => compactLine(turn.question))
    .filter(Boolean);

  const session = state.session;
  const dialogue = currentTurn.messages
    .map((message) =>
      formatBridgeDialogueMessage(message, session.trainingMode)
    )
    .filter(Boolean);

  return [
    'Краткий контекст перехода между текстовым и голосовым режимом.',
    'Используй его только как память текущего интервью; не считай это новой репликой пользователя.',
    '',
    `Роль: ${session.role || 'не указана'}.`,
    `Уровень: ${session.level || 'не указан'}.`,
    `Компания: ${session.companyName || 'не указана'}.`,
    `Вакансия: ${session.vacancyTitle || 'не указана'}.`,
    '',
    'Предыдущие основные вопросы (без ответов):',
    previousQuestions.length
      ? previousQuestions
          .map((question, index) => `${index + 1}. ${question}`)
          .join('\n')
      : 'Пока нет предыдущих основных вопросов.',
    '',
    `Текущий вопрос: ${compactLine(currentTurn.question)}`,
    '',
    'Диалог по текущему вопросу:',
    dialogue.length ? dialogue.join('\n') : 'По текущему вопросу ещё нет реплик.',
    '',
    'Продолжай обсуждать только текущий вопрос. Прошлые вопросы нужны только для ориентации в ходе интервью.',
  ].join('\n');
}

export function buildRealtimeResponseCreateEvent(params: {
  state: InterviewStateResponse | null | undefined;
  instructions?: string;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> {
  const bridgeContext = buildInterviewModeBridgeContext(params.state);
  const instructions = [params.instructions?.trim(), bridgeContext]
    .filter(Boolean)
    .join('\n\n');
  const response: Record<string, unknown> = {};

  if (params.metadata && Object.keys(params.metadata).length > 0) {
    response.metadata = params.metadata;
  }
  if (instructions) {
    response.instructions = instructions;
  }

  return Object.keys(response).length > 0
    ? { type: 'response.create', response }
    : { type: 'response.create' };
}

function formatBridgeDialogueMessage(
  message: InterviewDialogueMessage,
  trainingMode: InterviewTrainingMode
): string {
  const content = compactLine(message.content);
  if (!content) return '';
  if (trainingMode === 'interviewer') {
    return `${message.role === 'user' ? 'Интервьюер' : 'AI-кандидат'}: ${content}`;
  }
  return `${message.role === 'user' ? 'Кандидат' : 'Интервьюер'}: ${content}`;
}

function compactLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

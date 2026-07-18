import type {
  InterviewDialogueMessage,
  InterviewStateResponse,
  InterviewTrainingMode,
} from '@/shared/dto';
import { buildAskedQuestionsReminder } from '@/shared/interviewAskedQuestions';

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
  const isInterviewerTraining = session.trainingMode === 'interviewer';
  const dialogue = currentTurn.messages
    .map((message) =>
      formatBridgeDialogueMessage(message, session.trainingMode)
    )
    .filter(Boolean);
  // Явный список уже заданных уточнений — только когда AI играет интервьюера:
  // в тренировке интервьюера вопросы задаёт пользователь.
  const askedQuestionsReminder = isInterviewerTraining
    ? ''
    : buildAskedQuestionsReminder(currentTurn.messages, currentTurn.question);

  return [
    'Краткий контекст перехода между текстовым и голосовым режимом.',
    'Используй его только как память текущего интервью; не считай это новой репликой пользователя.',
    '',
    `Роль: ${session.role || 'не указана'}.`,
    `Уровень: ${session.level || 'не указан'}.`,
    `Компания: ${session.companyName || 'не указана'}.`,
    `Вакансия: ${session.vacancyTitle || 'не указана'}.`,
    '',
    isInterviewerTraining
      ? 'Предыдущие основные этапы (без реплик):'
      : 'Предыдущие основные вопросы (без ответов):',
    previousQuestions.length
      ? previousQuestions
          .map((question, index) => `${index + 1}. ${question}`)
          .join('\n')
      : 'Пока нет предыдущих основных вопросов.',
    '',
    `${isInterviewerTraining ? 'Текущий этап' : 'Текущий вопрос'}: ${compactLine(currentTurn.question)}`,
    '',
    isInterviewerTraining
      ? 'Диалог по текущему этапу:'
      : 'Диалог по текущему вопросу:',
    dialogue.length ? dialogue.join('\n') : 'По текущему вопросу ещё нет реплик.',
    ...(askedQuestionsReminder ? ['', askedQuestionsReminder] : []),
    '',
    isInterviewerTraining
      ? 'Продолжай только как AI-кандидат и отвечай на реплику пользователя-интервьюера. Не задавай вопросы от имени интервьюера и не управляй ходом интервью. Прошлые этапы нужны только для памяти.'
      : 'Продолжай только как интервьюер по текущему вопросу. Не объясняй тему и не отвечай вместо кандидата. Прошлые вопросы нужны только для ориентации в ходе интервью.',
  ].join('\n');
}

export function buildRealtimeTimeboxReminderInstruction(
  trainingMode: InterviewTrainingMode
): string {
  if (trainingMode === 'interviewer') return '';

  return 'Время на текущий вопрос истекло. В этой реплике не задавай новый вопрос и не добавляй уточнений. Заверши её коротким предложением перейти к следующему вопросу и дождись решения пользователя, например: «Отлично, этот вопрос мы достаточно обсудили. Готовы перейти к следующему?». Не переключай вопрос самостоятельно.';
}

export function buildRealtimeQuestionAnnouncement(params: {
  trainingMode: InterviewTrainingMode;
  question: string;
  firstQuestion: boolean;
  freshInterviewStart: boolean;
}): { contextText: string; announcementInstructions: string } {
  const question = compactLine(params.question);

  if (params.trainingMode === 'interviewer') {
    const contextText = params.freshInterviewStart
      ? `Тренировка интервьюера началась. Ты остаёшься AI-кандидатом и ждёшь первый вопрос пользователя. Текущий этап сценария: «${question}».`
      : params.firstQuestion
        ? `Пользователь включил голосовой режим в уже идущей тренировке интервьюера. Ты остаёшься AI-кандидатом. Текущий этап сценария: «${question}». Не начинай интервью заново.`
        : `Приложение переключило тренировку на следующий этап: «${question}». Ты остаёшься AI-кандидатом; ходом интервью управляет пользователь.`;
    const announcementInstructions = params.freshInterviewStart
      ? 'Коротко поздоровайся как кандидат и скажи, что готов к интервью. Не задавай пользователю вопросов, не озвучивай вопрос за него и ничего не объясняй.'
      : 'Коротко скажи как кандидат, что готов продолжить. Не задавай пользователю вопросов, не озвучивай вопрос за него и не управляй переходом.';

    return { contextText, announcementInstructions };
  }

  const contextText = params.freshInterviewStart
    ? `Интервью началось. Текущий вопрос: «${question}». Обсуждай только его.`
    : params.firstQuestion
      ? `Пользователь включил голосовой режим в уже идущем интервью. Текущий вопрос: «${question}». Продолжай с учётом контекста текущего интервью и не начинай интервью заново.`
      : `Приложение переключило интервью на следующий вопрос. Текущий вопрос теперь: «${question}». Обсуждай только его и не возвращайся к предыдущему вопросу.`;
  const announcementInstructions = params.freshInterviewStart
    ? `Коротко поздоровайся с кандидатом одной фразой (например, «Здравствуйте, давайте начнём») и сразу задай первый вопрос интервью дословно: «${question}». Ничего не добавляй после вопроса.`
    : params.firstQuestion
      ? `Коротко скажи, что продолжим голосом, и напомни текущий вопрос интервью дословно: «${question}». Не говори, что интервью начинается сначала. Ничего не добавляй после вопроса.`
      : `Озвучь кандидату следующий вопрос интервью дословно: «${question}». Перед вопросом допустима только короткая связка вроде «Хорошо, следующий вопрос». Ничего не добавляй после вопроса.`;

  return { contextText, announcementInstructions };
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

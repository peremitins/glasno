interface RuntimeRealtimeContext {
  sessionId: string;
  role?: string | null;
  level?: string | null;
  interviewerMode?: string | null;
  vacancyTitle?: string | null;
  companyName?: string | null;
  currentQuestion?: string | null;
}

interface RealtimeOptions {
  model: string;
  voice: string;
  transcriptionModel: string;
}

export function buildRealtimeInstructions(
  context: RuntimeRealtimeContext
): string {
  return [
    'Ты голосовой интервьюер JobAI. Всегда говори по-русски, кратко и естественно.',
    'Твоя задача — помочь кандидату вслух проговорить ответ на текущий вопрос собеседования.',
    'Ты не сохраняешь ответ и не утверждаешь, что интервью завершено. Пользователь сам отправляет финальный текстовый ответ в форме.',
    `ID сессии: ${context.sessionId}.`,
    `Роль: ${context.role || 'не указана'}.`,
    `Уровень: ${context.level || 'middle'}.`,
    `Режим интервьюера: ${context.interviewerMode || 'neutral'}.`,
    `Вакансия: ${context.vacancyTitle || 'не указана'}.`,
    `Компания: ${context.companyName || 'не указана'}.`,
    `Текущий вопрос: ${context.currentQuestion || 'нет активного вопроса'}.`,
    'Если пользователь просит подсказку, дай короткий ориентир по структуре STAR, но не отвечай за него.',
  ].join('\n');
}

export function buildRealtimeSessionPayload(
  context: RuntimeRealtimeContext,
  options: RealtimeOptions
) {
  return {
    session: {
      type: 'realtime',
      model: options.model,
      instructions: buildRealtimeInstructions(context),
      audio: {
        input: {
          // Без noise_reduction + transcription OpenAI не присылает текст речи
          // пользователя — в чате остаётся пустой пузырь «LIVE TRANSCRIPT».
          noise_reduction: {
            type: 'near_field',
          },
          // semantic_vad стабильнее реагирует на паузы и шорохи, чем server_vad,
          // и сам триггерит ответ ассистента (create_response).
          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'low',
            create_response: true,
            interrupt_response: false,
          },
          // Включаем транскрипцию входящего аудио — это и есть «живой» текст
          // пользователя, который попадает в ленту чата.
          transcription: {
            model: options.transcriptionModel,
          },
        },
        output: {
          voice: options.voice,
        },
      },
    },
  };
}

export function resolveRealtimeConfig(
  runtimeConfig: {
    realtimeModel?: unknown;
    realtimeVoice?: unknown;
    realtimeTranscriptionModel?: unknown;
  },
  env: Record<string, string | undefined> = process.env
) {
  return {
    model:
      normalizeString(runtimeConfig.realtimeModel) ||
      normalizeString(env.NUXT_OPENAI_REALTIME_MODEL) ||
      'gpt-realtime',
    voice:
      normalizeString(runtimeConfig.realtimeVoice) ||
      normalizeString(env.NUXT_OPENAI_REALTIME_VOICE) ||
      'marin',
    transcriptionModel:
      normalizeString(runtimeConfig.realtimeTranscriptionModel) ||
      normalizeString(env.NUXT_OPENAI_REALTIME_TRANSCRIPTION_MODEL) ||
      'gpt-4o-mini-transcribe',
  };
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

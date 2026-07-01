import {
  buildInterviewerGenderInstruction,
  type InterviewerGender,
} from '@/shared/interviewerVoice';

interface RuntimeRealtimeContext {
  sessionId: string;
  role?: string | null;
  level?: string | null;
  interviewerMode?: string | null;
  interviewerGender?: InterviewerGender | null;
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
    'Ты голосовой интервьюер JobAI. Всегда говори по-русски, кратко и естественно, как живой человек на собеседовании.',
    'Веди живой диалог по ТЕКУЩЕМУ вопросу: слушай ответ, реагируй, можешь задать короткий уточняющий вопрос.',
    'Если кандидат не понял вопрос или просит пояснить — переформулируй его проще, другими словами, приведи пример того, что тебя интересует.',
    'СТРОГО запрещено: отвечать вместо кандидата, подсказывать готовый ответ или решать задачу за него — ты проверяешь кандидата, а не учишь.',
    'Не переходи к следующему вопросу сам и не меняй тему. Один и тот же вопрос можно обсуждать несколькими репликами.',
    'Когда кандидат ответил достаточно полно или по вопросу уже много реплик — мягко предложи перейти к следующему вопросу и спроси согласие. Сам не переключай: переход выполняет приложение по команде пользователя («следующий вопрос», «дальше») или по кнопке.',
    'Не утверждай, что интервью завершено.',
    buildInterviewerGenderInstruction(context.interviewerGender || 'male'),
    `ID сессии: ${context.sessionId}.`,
    `Роль: ${context.role || 'не указана'}.`,
    `Уровень: ${context.level || 'middle'}.`,
    `Режим интервьюера: ${context.interviewerMode || 'neutral'}.`,
    `Вакансия: ${context.vacancyTitle || 'не указана'}.`,
    `Компания: ${context.companyName || 'не указана'}.`,
    `Текущий вопрос: ${context.currentQuestion || 'нет активного вопроса'}.`,
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

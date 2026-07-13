import {
  buildInterviewerGenderInstruction,
  buildInterviewerToneInstruction,
  getInterviewerGender,
  type InterviewerGender,
} from '@/shared/interviewerVoice';
import type {
  CandidateDifficulty,
  CandidatePersona,
  InterviewerFaceId,
  InterviewerMode,
  InterviewTrainingMode,
} from '@/shared/dto';
import {
  AI_CANDIDATE_ROLE_CONTRACT,
  AI_INTERVIEWER_ROLE_CONTRACT,
} from '@/shared/interviewRoleContract';

interface RuntimeRealtimeContext {
  sessionId: string;
  trainingMode?: InterviewTrainingMode | null;
  role?: string | null;
  level?: string | null;
  interviewerMode?: InterviewerMode | null;
  interviewerGender?: InterviewerGender | null;
  candidatePersona?: CandidatePersona | null;
  candidateDifficulty?: CandidateDifficulty | null;
  candidateNotes?: string | null;
  vacancyTitle?: string | null;
  companyName?: string | null;
  currentQuestion?: string | null;
}

interface RealtimeContextSource {
  session: {
    id: string;
    trainingMode?: InterviewTrainingMode | null;
    role?: string | null;
    level?: string | null;
    interviewerMode?: InterviewerMode | null;
    interviewerFaceId?: InterviewerFaceId | null;
    candidatePersona?: CandidatePersona | null;
    candidateDifficulty?: CandidateDifficulty | null;
    candidateNotes?: string | null;
    vacancyTitle?: string | null;
    companyName?: string | null;
  };
  currentTurn?: { question?: string | null } | null;
}

// Общий контекст для создания сессии (/api/realtime/session) и SDP-обмена
// (/api/realtime/session/sdp): второй эндпоинт восстанавливает те же
// инструкции по interview state сам, не доверяя конфигу от клиента.
export function buildRealtimeContextFromState(
  state: RealtimeContextSource
): RuntimeRealtimeContext {
  return {
    sessionId: state.session.id,
    trainingMode: state.session.trainingMode,
    role: state.session.role,
    level: state.session.level,
    interviewerMode: state.session.interviewerMode,
    interviewerGender: getInterviewerGender(state.session.interviewerFaceId),
    candidatePersona: state.session.candidatePersona,
    candidateDifficulty: state.session.candidateDifficulty,
    candidateNotes: state.session.candidateNotes,
    vacancyTitle: state.session.vacancyTitle,
    companyName: state.session.companyName,
    currentQuestion: state.currentTurn?.question ?? '',
  };
}

interface RealtimeOptions {
  model: string;
  voice: string;
  transcriptionModel: string;
}

export function buildRealtimeInstructions(
  context: RuntimeRealtimeContext
): string {
  if (context.trainingMode === 'interviewer') {
    return [
      'Ты голосовой AI-кандидат Гласно. Всегда говори по-русски, кратко и естественно, как живой человек на собеседовании.',
      AI_CANDIDATE_ROLE_CONTRACT,
      'Пользователь проводит интервью и тренирует навык интервьюера.',
      'Отвечай как кандидат по роли, вакансии, резюме и заданному профилю. Не помогай пользователю проводить интервью.',
      'Если вопрос общий, отвечай естественно, но не раскрывай всё сам: оставляй место для уточнений.',
      'Если пользователь произнёс команду перехода («следующий вопрос», «другой вопрос», «дальше», «переходим») — это команда приложению. Не спорь и не управляй переходом.',
      'Не утверждай, что интервью завершено, и не давай оценку интервьюеру во время разговора.',
      `ID сессии: ${context.sessionId}.`,
      `Роль кандидата: ${context.role || 'не указана'}.`,
      `Уровень кандидата: ${context.level || 'middle'}.`,
      `Профиль кандидата: ${describeCandidatePersona(context.candidatePersona)}.`,
      `Сложность кандидата: ${describeCandidateDifficulty(context.candidateDifficulty)}.`,
      `Заметки о кандидате: ${context.candidateNotes || 'нет'}.`,
      `Вакансия: ${context.vacancyTitle || 'не указана'}.`,
      `Компания: ${context.companyName || 'не указана'}.`,
      `Текущий этап: ${context.currentQuestion || 'нет активного этапа'}.`,
    ].join('\n');
  }

  return [
    'Ты голосовой интервьюер Гласно. Всегда говори по-русски, кратко и естественно.',
    AI_INTERVIEWER_ROLE_CONTRACT,
    'Если кандидат не понял вопрос или просит пояснить — только переформулируй его проще и уточни, какой аспект опыта тебя интересует. Не объясняй предметную область и не приводи готовый ответ или решение.',
    'СТРОГО запрещено: отвечать вместо кандидата, подсказывать готовый ответ, решать задачу за него или демонстрировать экспертное решение — ты проверяешь кандидата, а не учишь.',
    'Не переходи к следующему вопросу сам и не меняй тему. Один и тот же вопрос можно обсуждать несколькими репликами.',
    'Когда кандидат ответил достаточно полно или по вопросу уже много реплик — мягко предложи перейти к следующему вопросу и спроси согласие. Сам не переключай: переход выполняет приложение по команде пользователя («следующий вопрос», «другой вопрос», «дальше») или по кнопке.',
    'ВАЖНО: если кандидат произнёс команду перехода («следующий вопрос», «другой вопрос», «дальше», «переходим», «к следующему вопросу», «к другому вопросу») — это команда приложению, а не реплика для тебя. НЕ отвечай на неё: не отговаривай, не проси завершить текущий вопрос, не комментируй. Молчи — приложение переключит вопрос и отдельно попросит тебя озвучить новый.',
    'Не утверждай, что интервью завершено.',
    buildInterviewerToneInstruction(context.interviewerMode),
    buildInterviewerGenderInstruction(context.interviewerGender || 'male'),
    `ID сессии: ${context.sessionId}.`,
    `Роль: ${context.role || 'не указана'}.`,
    `Уровень: ${context.level || 'middle'}.`,
    `Вакансия: ${context.vacancyTitle || 'не указана'}.`,
    `Компания: ${context.companyName || 'не указана'}.`,
    `Текущий вопрос: ${context.currentQuestion || 'нет активного вопроса'}.`,
  ].join('\n');
}

function describeCandidatePersona(
  persona?: CandidatePersona | null
): string {
  switch (persona) {
    case 'verbose_vague':
      return 'много говорит, но часто без фактов';
    case 'anxious':
      return 'волнуется и иногда просит уточнить вопрос';
    case 'overconfident':
      return 'уверен в себе и может переоценивать вклад';
    case 'weak_hard_good_soft':
      return 'приятный в общении, но профессиональная конкретика слабее';
    case 'strong_brief':
    default:
      return 'сильный, отвечает кратко и по делу';
  }
}

function describeCandidateDifficulty(
  difficulty?: CandidateDifficulty | null
): string {
  switch (difficulty) {
    case 'calm':
      return 'спокойный сценарий';
    case 'challenging':
      return 'сложный сценарий с неполными ответами и уходом от конкретики';
    case 'realistic':
    default:
      return 'реалистичный сценарий';
  }
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
          // semantic_vad стабильнее реагирует на паузы и шорохи, чем server_vad.
          // create_response: false — ответ ассистента запускает КЛИЕНТ явно
          // (response.create) после прихода транскрипта реплики. Иначе модель
          // начинала говорить до того, как приложение видело текст, и на
          // команду «следующий вопрос» успевала произнести несколько слов,
          // которые потом обрывались.
          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'low',
            create_response: false,
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
      'gpt-realtime-mini',
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

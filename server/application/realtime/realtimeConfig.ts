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
  InterviewQuestionSourceMode,
  InterviewTrainingMode,
} from '@/shared/dto';
import {
  AI_CANDIDATE_ROLE_CONTRACT,
  AI_INTERVIEWER_ROLE_CONTRACT,
} from '@/shared/interviewRoleContract';
import { buildCandidateBehaviorContract } from '@/shared/candidateBehavior';

interface RuntimeRealtimeContext {
  sessionId: string;
  trainingMode?: InterviewTrainingMode | null;
  questionSourceMode?: InterviewQuestionSourceMode | null;
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
  // План интервьюера — только справка для модели: она не должна вести по нему
  // разговор, порядок и выбор тем остаются за пользователем.
  planQuestions?: string[] | null;
  // Фактура интервью. В режиме интервьюера это резюме, по которому играет
  // AI-кандидат; в режиме кандидата — резюме пользователя, по которому
  // AI-интервьюер задаёт релевантные вопросы.
  resumeRaw?: string | null;
  vacancyRaw?: string | null;
}

interface RealtimeContextSource {
  session: {
    id: string;
    trainingMode?: InterviewTrainingMode | null;
    questionSourceMode?: InterviewQuestionSourceMode | null;
    role?: string | null;
    level?: string | null;
    interviewerMode?: InterviewerMode | null;
    interviewerFaceId?: InterviewerFaceId | null;
    candidatePersona?: CandidatePersona | null;
    candidateDifficulty?: CandidateDifficulty | null;
    candidateNotes?: string | null;
    vacancyTitle?: string | null;
    companyName?: string | null;
    plan?: { items?: Array<{ question?: string | null }> | null } | null;
  };
  currentTurn?: { question?: string | null } | null;
}

// Фактура интервью хранится отдельно от DTO состояния — см.
// InterviewService.getSessionBackground.
export interface RealtimeBackground {
  resumeRaw?: string | null;
  vacancyRaw?: string | null;
}

// Общий контекст для создания сессии (/api/realtime/session) и SDP-обмена
// (/api/realtime/session/sdp): второй эндпоинт восстанавливает те же
// инструкции по interview state сам, не доверяя конфигу от клиента.
export function buildRealtimeContextFromState(
  state: RealtimeContextSource,
  background: RealtimeBackground = {}
): RuntimeRealtimeContext {
  return {
    sessionId: state.session.id,
    trainingMode: state.session.trainingMode,
    questionSourceMode: state.session.questionSourceMode,
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
    planQuestions: (state.session.plan?.items ?? [])
      .map((item) => item?.question?.trim())
      .filter((question): question is string => Boolean(question)),
    resumeRaw: background.resumeRaw ?? null,
    vacancyRaw: background.vacancyRaw ?? null,
  };
}

// Инструкции сессии дописываются к КАЖДОМУ response.create (иначе модель
// теряет роль), поэтому длинные тексты режем: иначе резюме на 10 000 знаков
// уходило бы провайдеру на каждую реплику.
// Резюме — биография, по которой AI-кандидат играет: обрезать его жёстко
// нельзя, иначе модель знает только последнее место работы (резюме идут от
// свежего к старому, и срез оставлял шапку с последней должностью). 6000
// символов покрывают резюме на одну-две страницы вместе с историей опыта.
const REALTIME_RESUME_LIMIT = 6000;
// Описание вакансии для AI-кандидата второстепенно, а тексты с hh.ru бывают
// очень длинными — ему хватает более скромного лимита.
const REALTIME_VACANCY_LIMIT = 1500;

function compactRealtimeBackground(
  value: string | null | undefined,
  limit: number
): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= limit) return text;

  // Обрываем по границе предложения, а не посреди слова: модель получает
  // связный текст, а не обрубок фразы.
  const head = text.slice(0, limit);
  const sentenceEnd = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? '),
    head.lastIndexOf('; ')
  );
  // Слишком ранняя граница означала бы, что мы выбросили половину лимита,
  // поэтому откатываемся к границе слова.
  if (sentenceEnd > limit * 0.6) {
    return `${head.slice(0, sentenceEnd + 1)} …`;
  }
  const wordEnd = head.lastIndexOf(' ');
  return `${(wordEnd > 0 ? head.slice(0, wordEnd) : head).trimEnd()} …`;
}

// Резюме — главный источник фактуры о кандидате. В режиме интервьюера это
// биография, которую AI-кандидат обязан играть как свою: без неё он выдумывал
// опыт, не связанный с загруженным файлом.
function buildCandidateResumeInstruction(
  resumeRaw: string | null | undefined,
  trainingMode: InterviewTrainingMode = 'interviewer'
): string {
  const resume = compactRealtimeBackground(resumeRaw, REALTIME_RESUME_LIMIT);
  if (trainingMode === 'interviewer') {
    if (!resume) {
      return 'Резюме кандидата не загружено: придерживайся роли и уровня, не выдумывай конкретных работодателей и метрик.';
    }
    return `Твоё резюме (играй строго по нему, это твой опыт; не выдумывай фактов сверх него): ${resume}`;
  }

  if (!resume) {
    return 'Резюме кандидата не загружено: задавай вопросы по роли и вакансии.';
  }
  return `Резюме кандидата (опирайся на него в вопросах и уточнениях): ${resume}`;
}

function buildVacancyDetailsInstruction(
  vacancyRaw: string | null | undefined
): string {
  const vacancy = compactRealtimeBackground(vacancyRaw, REALTIME_VACANCY_LIMIT);
  return vacancy ? `Описание вакансии: ${vacancy}` : '';
}

// План показываем модели как ориентир по темам, а не как сценарий: вести
// разговор и выбирать порядок должен пользователь-интервьюер.
function buildInterviewerPlanReference(
  planQuestions?: string[] | null
): string {
  const questions = (planQuestions ?? []).filter((question) =>
    question.trim()
  );
  if (!questions.length) {
    return 'У пользователя нет заранее составленного плана: он ведёт разговор свободно.';
  }

  const list = questions
    .map((question, index) => `${index + 1}) ${question}`)
    .join(' ');
  return `Пользователь ведёт интервью по своему плану (справочно, только чтобы понимать возможные темы): ${list}. Не управляй порядком, не переключай темы сам и не напоминай про план.`;
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
      'Ты голосовой AI-кандидат Гласно. Всегда говори по-русски и естественно, как живой человек на собеседовании. Длину ответа определяет выбранный профиль AI-кандидата.',
      AI_CANDIDATE_ROLE_CONTRACT,
      'Пользователь проводит интервью и тренирует навык интервьюера.',
      'Отвечай как кандидат по роли, вакансии, резюме и заданному профилю. Не помогай пользователю проводить интервью.',
      'Если вопрос общий, отвечай естественно, но не раскрывай всё сам: оставляй место для уточнений.',
      'Интервью идёт одним непрерывным разговором: пользователь сам решает, о чём спросить дальше, и сам завершает встречу. Команд перехода в приложении нет. Фразы «следующий вопрос», «другой вопрос», «дальше» и «переходим» считай обычной частью разговора и отвечай на них в контексте реплики пользователя.',
      'Не утверждай, что интервью завершено, и не давай оценку интервьюеру во время разговора.',
      `ID сессии: ${context.sessionId}.`,
      `Роль кандидата: ${context.role || 'не указана'}.`,
      `Уровень кандидата: ${context.level || 'middle'}.`,
      buildCandidateBehaviorContract({
        persona: context.candidatePersona,
        difficulty: context.candidateDifficulty,
        notes: context.candidateNotes,
      }),
      `Вакансия: ${context.vacancyTitle || 'не указана'}.`,
      `Компания: ${context.companyName || 'не указана'}.`,
      buildCandidateResumeInstruction(context.resumeRaw),
      buildVacancyDetailsInstruction(context.vacancyRaw),
      buildInterviewerPlanReference(context.planQuestions),
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    'Ты голосовой интервьюер Гласно. Всегда говори по-русски, кратко и естественно.',
    AI_INTERVIEWER_ROLE_CONTRACT,
    'Если кандидат не понял вопрос или просит пояснить — только переформулируй его проще и уточни, какой аспект опыта тебя интересует. Не объясняй предметную область и не приводи готовый ответ или решение.',
    'СТРОГО запрещено: отвечать вместо кандидата, подсказывать готовый ответ, решать задачу за него или демонстрировать экспертное решение — ты проверяешь кандидата, а не учишь.',
    'Не переходи к следующему вопросу сам и не меняй тему. Один и тот же вопрос можно обсуждать несколькими репликами.',
    'Уточняй ответ только если это помогает проверить ещё не раскрытый аспект текущего вопроса. НИКОГДА не повторяй уточняющий вопрос, который уже задавал по текущему вопросу, даже в другой формулировке — сверяйся с разговором и со списком уже заданных уточняющих вопросов. Если новых аспектов не осталось — предложи перейти к следующему вопросу.',
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
    buildCandidateResumeInstruction(context.resumeRaw, 'candidate'),
    buildVacancyDetailsInstruction(context.vacancyRaw),
    `Текущий вопрос: ${context.currentQuestion || 'нет активного вопроса'}.`,
  ]
    .filter(Boolean)
    .join('\n');
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

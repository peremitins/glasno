import OpenAI from 'openai';
import { apiError } from '@/server/utils/errors';
import type {
  ConverseParams,
  EvaluateAnswerParams,
  GenerateQuestionHintsParams,
  GenerateQuestionParams,
  GenerateSampleAnswerHintParams,
  InterviewEngine,
  NormalizeCustomQuestionsParams,
} from '@/server/interface/interviewEngine';
import type {
  InterviewSessionRecord,
  InterviewTurnRecord,
} from '@/server/interface/interviewRepository';
import type { RecordAiUsageInput } from '@/server/application/aiUsage/aiUsageService';
import {
  buildInterviewerGenderInstruction,
  getInterviewerGender,
} from '@/shared/interviewerVoice';
import type {
  CandidateDifficulty,
  CandidatePersona,
  InterviewerFaceId,
  InterviewFocus,
  InterviewTrainingMode,
  QuestionHintDetails,
  QuestionPreferenceStatus,
  QuestionSemanticPassport,
} from '@/shared/dto';
import { QuestionSemanticPassportDto } from '@/shared/dto';
import {
  sendOpenAiResponsesRequest,
  type OpenAiResponsesPurpose,
} from './openaiResponsesClient';
import { compactGeneratedText } from './textNormalization';
import { logger } from '@/server/utils/logger';

// Извлекает usage из ответа Responses API в наши поля.
export function extractUsageAmounts(response: any): {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
} {
  const usage = response?.usage || {};
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
    cachedInputTokens: Number(cached),
    outputTokens: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
  };
}

function usageContext(session: InterviewSessionRecord) {
  return {
    userId: session.userId,
    anonymousSessionId: session.anonymousSessionId,
    interviewSessionId: session.id,
  };
}

const DEFAULT_MODEL = 'gpt-5.4-nano'; // была 'gpt-4o-mini' (заменено 2026-07)

export function extractResponsesText(response: any): string {
  const chunks: string[] = [];
  if (typeof response?.output_text === 'string') {
    chunks.push(response.output_text);
  }

  for (const output of response?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (
        (content?.type === 'output_text' || content?.type === 'text') &&
        typeof content.text === 'string'
      ) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join('').trim();
}

export function parseJsonObject(raw: string): Record<string, any> {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? extractObjectCandidate(trimmed);
  return JSON.parse(candidate);
}

function extractObjectCandidate(value: string): string {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end < start) return value;
  return value.slice(start, end + 1);
}

function compactTextList(
  value: unknown,
  fallback: string[],
  maxItems: number,
  maxLength: number
): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const text = compactGeneratedText(item, '', maxLength);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function normalizeQuestionHintDetails(value: unknown): QuestionHintDetails {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return {
    focus: compactGeneratedText(
      raw.focus,
      'Проверяет, насколько ответ связан с текущим вопросом и ролью.',
      260
    ),
    answerPlan: compactTextList(
      raw.answerPlan,
      [
        'Коротко ответьте на сам вопрос без длинной предыстории.',
        'Добавьте один релевантный пример из опыта или учебного проекта.',
        'Назовите личное действие и понятный результат.',
      ],
      4,
      220
    ),
    keyDefinitions: compactTextList(raw.keyDefinitions, [], 4, 220),
    sampleAnswer: compactGeneratedText(
      raw.sampleAnswer,
      'Я бы ответил от первого лица: коротко задал контекст, назвал своё действие и завершил результатом, не добавляя факты, которых нет в моём опыте.',
      700
    ),
  };
}

export function normalizeSampleAnswerHint(value: unknown): {
  sampleAnswer: string;
} {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return {
    sampleAnswer: compactGeneratedText(
      raw.sampleAnswer,
      'Я бы ответил от первого лица: коротко ответил на уточняющий вопрос, добавил один релевантный пример и не выдумывал факты, которых нет в моём опыте.',
      700
    ),
  };
}

export interface GeneratedQuestionCandidate {
  question: string;
  semantic: QuestionSemanticPassport;
  matchesPreferenceIds: string[];
}

export interface QuestionGenerationPreference {
  id: string;
  status: Extract<QuestionPreferenceStatus, 'repeat' | 'hidden'>;
  question: string;
  semantic: QuestionSemanticPassport | null;
}

export function selectGeneratedQuestionCandidate(
  candidates: GeneratedQuestionCandidate[],
  preferences: QuestionGenerationPreference[]
): GeneratedQuestionCandidate | null {
  return (
    candidates.find((candidate) => {
      if (candidate.matchesPreferenceIds.length > 0) return false;
      return !preferences.some((preference) =>
        semanticConceptsConflict(candidate.semantic, preference.semantic)
      );
    }) ?? null
  );
}

function normalizeGeneratedQuestionCandidates(
  raw: Record<string, unknown>
): GeneratedQuestionCandidate[] {
  if (!Array.isArray(raw.candidates)) return [];
  return raw.candidates
    .map((value): GeneratedQuestionCandidate | null => {
      if (!value || typeof value !== 'object') return null;
      const candidate = value as Record<string, unknown>;
      const question =
        typeof candidate.question === 'string' ? candidate.question.trim() : '';
      const semantic = QuestionSemanticPassportDto.safeParse(candidate.semantic);
      if (!question || !semantic.success) return null;
      const matchesPreferenceIds = Array.isArray(candidate.matchesPreferenceIds)
        ? candidate.matchesPreferenceIds
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean)
        : [];
      return { question, semantic: semantic.data, matchesPreferenceIds };
    })
    .filter((item): item is GeneratedQuestionCandidate => Boolean(item))
    .slice(0, 2);
}

function formatQuestionPreferences(
  preferences: QuestionGenerationPreference[]
): string {
  if (!preferences.length) return 'Нет.';
  return preferences
    .map((preference) => {
      const semantic = preference.semantic;
      const concept = semantic
        ? `${semantic.conceptLabel}; key=${semantic.conceptKey}; tags=${semantic.topicTags.join(',') || 'нет'}`
        : preference.question;
      return `- id=${preference.id}; status=${preference.status}; concept=${concept}`;
    })
    .join('\n');
}

function semanticConceptsConflict(
  candidate: QuestionSemanticPassport,
  saved: QuestionSemanticPassport | null
): boolean {
  if (!saved) return false;
  if (candidate.conceptKey === saved.conceptKey) return true;
  const candidateTags = new Set(candidate.topicTags);
  const savedTags = new Set(saved.topicTags);
  if (!candidateTags.size || !savedTags.size) return false;
  let intersection = 0;
  for (const tag of candidateTags) {
    if (savedTags.has(tag)) intersection += 1;
  }
  return intersection / Math.min(candidateTags.size, savedTags.size) >= 0.75;
}

function formatTurns(turns: InterviewTurnRecord[]): string {
  if (!turns.length) return 'Пока нет предыдущих вопросов.';
  return turns
    .map((turn) => {
      const answer = turn.answerTranscript
        ? `\nОтвет: ${turn.answerTranscript}`
        : '';
      return `#${turn.index} [${turn.kind}] ${turn.question}${answer}`;
    })
    .join('\n\n');
}

function sessionContext(params: GenerateQuestionParams | EvaluateAnswerParams) {
  return sessionContextForConverse(params.session);
}

function sessionContextForConverse(session: InterviewSessionRecord) {
  const focus = readInterviewFocus(session);
  return [
    `Режим тренировки: ${describeTrainingMode(readTrainingMode(session))}`,
    `Роль: ${session.role || 'не указана'}`,
    `Уровень: ${session.level || 'middle'}`,
    `Режим интервьюера: ${session.interviewerMode}`,
    buildInterviewerGenderInstruction(
      getInterviewerGender(readInterviewerFaceId(session))
    ),
    `Язык: ${session.language}`,
    `Компания: ${session.companyName || 'не указана'}`,
    `Вакансия: ${session.vacancyTitle || 'не указана'}`,
    `Описание вакансии: ${session.vacancyRaw || 'нет'}`,
    `Резюме кандидата: ${session.resumeRaw || 'нет'}`,
    `Профиль AI-кандидата: ${describeCandidatePersona(readCandidatePersona(session))}`,
    `Сложность AI-кандидата: ${describeCandidateDifficulty(readCandidateDifficulty(session))}`,
    `Заметки о кандидате: ${readCandidateNotes(session) || 'нет'}`,
    `Фокус интервью: ${describeInterviewFocus(focus)}`,
  ].join('\n');
}

function readInterviewerFaceId(
  session: InterviewSessionRecord
): InterviewerFaceId | null {
  const value = session.metadata?.interviewerFaceId;
  return typeof value === 'string' ? (value as InterviewerFaceId) : null;
}

function readInterviewFocus(session: InterviewSessionRecord): InterviewFocus | null {
  const value = session.metadata?.focus;
  return typeof value === 'string' ? (value as InterviewFocus) : null;
}

function readTrainingMode(session: InterviewSessionRecord): InterviewTrainingMode {
  if (session.trainingMode === 'interviewer') return 'interviewer';
  const value = session.metadata?.trainingMode;
  return value === 'interviewer' ? 'interviewer' : 'candidate';
}

function readCandidatePersona(session: InterviewSessionRecord): CandidatePersona {
  const value = session.metadata?.candidatePersona;
  return isCandidatePersona(value) ? value : 'strong_brief';
}

function readCandidateDifficulty(
  session: InterviewSessionRecord
): CandidateDifficulty {
  const value = session.metadata?.candidateDifficulty;
  return isCandidateDifficulty(value) ? value : 'realistic';
}

function readCandidateNotes(session: InterviewSessionRecord): string {
  const value = session.metadata?.candidateNotes;
  return typeof value === 'string' ? value.trim() : '';
}

// Короткая инструкция для LLM о том, какие вопросы задавать в этом фокусе.
// null — фокус не задан пользователем, движок сам балансирует типы вопросов.
function describeInterviewFocus(focus: InterviewFocus | null): string {
  switch (focus) {
    case 'hr_screening':
      return 'HR-скрининг — вопросы про мотивацию, ожидания от роли, причины поиска, soft skills. Без глубоких технических/профессиональных задач.';
    case 'professional':
      return 'Профессиональное интервью — хард-скиллы и практические задачи именно по роли/вакансии, минимум общих HR-вопросов.';
    case 'behavioral':
      return 'Поведенческое интервью — вопросы про прошлый опыт в формате STAR (ситуация, задача, действие, результат), про конфликты, решения, командную работу.';
    case 'salary_negotiation':
      return 'Зарплатные переговоры — вопросы про ожидания по компенсации, аргументацию цифры, реакцию на встречное предложение и возражения работодателя.';
    default:
      return 'не задан — смешивай HR, профессиональные и поведенческие вопросы сбалансированно.';
  }
}

function describeTrainingMode(mode: InterviewTrainingMode): string {
  return mode === 'interviewer'
    ? 'пользователь проводит интервью, AI играет кандидата'
    : 'пользователь проходит интервью как кандидат, AI играет интервьюера';
}

function describeCandidatePersona(persona: CandidatePersona): string {
  switch (persona) {
    case 'verbose_vague':
      return 'много говорит, но часто отвечает общо и без фактов';
    case 'anxious':
      return 'волнуется, сомневается, иногда просит уточнить вопрос';
    case 'overconfident':
      return 'уверен в себе, может переоценивать вклад и уходить от слабых мест';
    case 'weak_hard_good_soft':
      return 'приятно общается, но профессиональная конкретика слабее заявленного уровня';
    case 'strong_brief':
    default:
      return 'сильный кандидат, отвечает кратко и по делу';
  }
}

function describeCandidateDifficulty(difficulty: CandidateDifficulty): string {
  switch (difficulty) {
    case 'calm':
      return 'спокойный сценарий, кандидат отвечает дружелюбно и достаточно прямо';
    case 'challenging':
      return 'сложный сценарий, кандидат может давать неполные ответы, спорить или уходить от конкретики';
    case 'realistic':
    default:
      return 'реалистичный сценарий, кандидат отвечает естественно, не помогает интервьюеру сверх меры';
  }
}

function isCandidatePersona(value: unknown): value is CandidatePersona {
  return (
    value === 'strong_brief' ||
    value === 'verbose_vague' ||
    value === 'anxious' ||
    value === 'overconfident' ||
    value === 'weak_hard_good_soft'
  );
}

function isCandidateDifficulty(value: unknown): value is CandidateDifficulty {
  return value === 'calm' || value === 'realistic' || value === 'challenging';
}

// Текст диалога по текущему вопросу для промпта converse/converseStream.
function formatConverseDialogue(params: ConverseParams): string {
  return formatDialogue(params.dialogue, readTrainingMode(params.session));
}

function formatDialogue(
  dialogue: Array<{ role: 'user' | 'interviewer'; content: string }>,
  trainingMode: InterviewTrainingMode = 'candidate'
): string {
  const userLabel = trainingMode === 'interviewer' ? 'Интервьюер' : 'Кандидат';
  const aiLabel = trainingMode === 'interviewer' ? 'AI-кандидат' : 'Интервьюер';
  return dialogue.length
    ? dialogue
        .map(
          (message) =>
            `${message.role === 'user' ? userLabel : aiLabel}: ${message.content}`
        )
        .join('\n')
    : trainingMode === 'interviewer'
      ? 'Интервьюер ещё ничего не сказал.'
      : 'Кандидат ещё ничего не сказал.';
}

export function buildConverseUserText(params: ConverseParams): string {
  return [
    sessionContextForConverse(params.session),
    '',
    `Предыдущие основные вопросы (без ответов):\n${formatPreviousMainQuestions(params.turns, params.turn)}`,
    '',
    `Текущий вопрос: ${params.turn.question}`,
    `Реплик кандидата по этому вопросу: ${params.exchanges}`,
    '',
    `Диалог по текущему вопросу:\n${formatConverseDialogue(params)}`,
  ].join('\n');
}

function formatPreviousMainQuestions(
  turns: InterviewTurnRecord[],
  currentTurn: InterviewTurnRecord
): string {
  const previous = turns
    .filter(
      (turn) =>
        turn.kind === 'main' &&
        turn.id !== currentTurn.id &&
        turn.index < currentTurn.index
    )
    .sort((left, right) => left.index - right.index)
    .map((turn, index) => `${index + 1}. ${turn.question.trim()}`)
    .filter((line) => line.length > 3);

  return previous.length
    ? previous.join('\n')
    : 'Пока нет предыдущих основных вопросов.';
}

// Общая часть инструкции интервьюера (без формата вывода).
const CANDIDATE_TRAINING_CONVERSE_RULES =
  'Ты — интервьюер Гласно, ведёшь живое собеседование голосом и текстом. Веди диалог по ТЕКУЩЕМУ вопросу как живой человек. ' +
  'Реагируй кратко (1–3 предложения), по-русски, в роли интервьюера. ' +
  'Строго соблюдай указанный пол интервьюера и грамматический род в репликах от своего лица. ' +
  'Если кандидат не понял вопрос или просит пояснить — переформулируй вопрос проще, другими словами, приведи пример того, что тебя интересует. ' +
  'Можно задать короткий уточняющий вопрос по ответу. ' +
  'СТРОГО запрещено: отвечать ВМЕСТО кандидата, подсказывать готовый ответ, решать задачу за него — ты проверяешь кандидата, а не учишь. ' +
  'НЕ переходи к следующему вопросу из плана сам и не меняй тему. ' +
  'Решение о переходе принимает пользователь — ты только предлагаешь.';

const INTERVIEWER_TRAINING_CONVERSE_RULES =
  'Ты — AI-кандидат Гласно. Пользователь проводит интервью и тренирует навык интервьюера. ' +
  'В диалоге отвечай как кандидат по роли, вакансии, резюме и профилю AI-кандидата. ' +
  'Пиши по-русски, кратко и естественно: 1–3 предложения, без префиксов и оценок пользователя. ' +
  'Не помогай интервьюеру формулировать вопросы и не объясняй, как проводить интервью. ' +
  'Если вопрос интервьюера общий, отвечай естественно, но не раскрывай всё сам: оставляй место для уточняющих вопросов. ' +
  'Если спрашивают рискованное или некорректное, отвечай осторожно и по-человечески, без юридических лекций. ' +
  'НЕ переходи к следующей теме сам и не объявляй итог собеседования. Решение о переходе принимает пользователь.';

export function buildConverseInstruction(
  session: Pick<InterviewSessionRecord, 'trainingMode' | 'interviewerMode' | 'metadata'>
): string {
  return readTrainingMode(session as InterviewSessionRecord) === 'interviewer'
    ? INTERVIEWER_TRAINING_CONVERSE_RULES
    : CANDIDATE_TRAINING_CONVERSE_RULES;
}

const CONVERSE_MOVE_ON_RULE =
  'Если кандидат ответил достаточно полно, либо по этому вопросу уже было много реплик, либо он явно «плавает» и продолжать смысла нет — предложи перейти к следующему вопросу (например: «Хорошо, здесь всё понятно. Готовы перейти к следующему вопросу?»).';

const NEXT_MARKER = '<<<NEXT>>>';
const STAY_MARKER = '<<<STAY>>>';
// Запас в хвосте стрима, чтобы маркер перехода никогда не «утёк» в чат,
// даже если разрезан между чанками.
const MARKER_GUARD = 24;

// Отрезает завершающий маркер перехода и хвостовые пробелы, сохраняя
// начало текста без изменений (важно для корректного склеивания чанков).
function splitMoveOnMarker(text: string): {
  clean: string;
  suggestMoveOn: boolean;
} {
  const markerMatch = text.match(/<<<\s*(NEXT|STAY)\s*>>>/i);
  const suggestMoveOn = /<<<\s*NEXT\s*>>>/i.test(text);
  const cut = markerMatch?.index ?? -1;
  const clean = (cut >= 0 ? text.slice(0, cut) : text).replace(/\s+$/, '');
  return { clean, suggestMoveOn };
}

export class OpenAiInterviewEngine implements InterviewEngine {
  constructor(
    private readonly options: {
      apiKey: string;
      model?: string;
      organization?: string | null;
      project?: string | null;
      recordUsage?: (input: RecordAiUsageInput) => void;
    }
  ) {}

  async normalizeCustomQuestions(
    params: NormalizeCustomQuestionsParams
  ): Promise<{ questions: string[] }> {
    const raw = await this.requestJson({
      instruction:
        'Ты редактор плана интервью Гласно. Из пользовательского текста выдели только вопросы для тренировки собеседования. ' +
        'Убери дубли, мусор, комментарии и слишком общие повторы. Если фраза является просьбой вроде "спроси про конфликт", преврати её в естественный вопрос интервьюера. ' +
        'Не добавляй свои новые темы, если их нет в исходном тексте. Верни строго JSON вида {"questions":["..."]}.',
      userText: [
        `Роль: ${params.role || 'не указана'}`,
        `Уровень: ${params.level || 'middle'}`,
        `Вакансия: ${params.vacancyTitle || 'не указана'}`,
        `Описание вакансии: ${params.vacancyRaw || 'нет'}`,
        `Резюме кандидата: ${params.resumeText || 'нет'}`,
        `Режим источника вопросов: ${params.questionSourceMode || 'mixed'}`,
        '',
        `Пользовательский текст:\n${params.rawText}`,
      ].join('\n'),
      maxOutputTokens: 700,
      kind: 'custom_question_normalize',
      context: {
        userId: params.userId ?? null,
        anonymousSessionId: params.anonymousSessionId,
        interviewSessionId: null,
      },
    });

    const questions = Array.isArray(raw.questions)
      ? raw.questions
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      : [];

    return { questions };
  }

  async generateQuestion(
    params: GenerateQuestionParams
  ): Promise<{
    question: string;
    semantic?: QuestionSemanticPassport | null;
  }> {
    const isInterviewerTraining =
      readTrainingMode(params.session) === 'interviewer';
    if (isInterviewerTraining) {
      const raw = await this.requestJson({
        instruction:
          'Ты редактор сценария Гласно. Сгенерируй короткую стартовую или переходную реплику AI-кандидата для тренировки интервьюера. Реплика должна дать пользователю повод задать следующий вопрос, но не проводить интервью за него. Не повторяй предыдущие реплики. Верни строго JSON вида {"question":"..."}',
        userText: `${sessionContext(params)}\n\nИстория:\n${formatTurns(params.turns)}`,
        maxOutputTokens: 220,
        kind: 'question_gen',
        context: usageContext(params.session),
      });
      const question =
        typeof raw.question === 'string' ? raw.question.trim() : '';
      if (!question) {
        throw apiError('E_UPSTREAM', 'Провайдер не вернул текст вопроса');
      }
      return { question };
    }

    const preferences = (params.questionPreferences ?? []).slice(0, 40);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await this.requestJson({
        instruction:
          'Ты профессиональный интервьюер. Предложи ДВА разных кратких вопроса для собеседования. Не повторяй предыдущие вопросы и не создавай смысловые аналоги запрещённых или назначенных на повторение концептов. ' +
          'Для каждого вопроса верни смысловой паспорт. conceptKey — короткий стабильный snake_case ключ смысла, conceptLabel — краткое название проверяемого знания, topicTags — 1–5 смысловых тегов, requiredContextTags — только технологии, без которых вопрос теряет смысл (для общего вопроса пустой массив), focus — одно из hr_screening, professional, behavioral, salary_negotiation или null. ' +
          'Если кандидат совпадает с одним из переданных правил, перечисли его id в matchesPreferenceIds; такой кандидат всё равно нужен как сигнал проверки. ' +
          'Верни строго JSON вида {"candidates":[{"question":"...","semantic":{"conceptKey":"...","conceptLabel":"...","topicTags":["..."],"requiredContextTags":["..."],"focus":"professional"},"matchesPreferenceIds":[]},{"question":"...","semantic":{...},"matchesPreferenceIds":[]}]}.',
        userText: [
          sessionContext(params),
          '',
          `История:\n${formatTurns(params.turns)}`,
          '',
          `Допустимые теги специализации для requiredContextTags: ${(params.questionContextTags ?? []).join(', ') || 'нет — используй пустой массив'}.`,
          '',
          `Правила пользователя:\n${formatQuestionPreferences(preferences)}`,
          attempt > 0
            ? '\nПредыдущая пара не прошла локальную проверку. Выбери две другие темы.'
            : '',
        ].join('\n'),
        maxOutputTokens: 620,
        kind: 'question_gen',
        context: usageContext(params.session),
      });
      const candidates = normalizeGeneratedQuestionCandidates(raw);
      const selected = selectGeneratedQuestionCandidate(candidates, preferences);
      if (selected) {
        return { question: selected.question, semantic: selected.semantic };
      }
      logger.warn(
        {
          interviewSessionId: params.session.id,
          attempt: attempt + 1,
          candidateCount: candidates.length,
        },
        'Generated interview questions conflicted with user preferences'
      );
    }

    throw apiError(
      'E_UPSTREAM',
      'Не удалось подобрать вопрос без запрещённых повторов'
    );
  }

  async generateQuestionHints(
    params: GenerateQuestionHintsParams
  ): Promise<QuestionHintDetails> {
    const isInterviewerTraining =
      readTrainingMode(params.session) === 'interviewer';
    const raw = await this.requestJson({
      instruction: isInterviewerTraining
        ? 'Ты тренер интервьюеров Гласно. Сгенерируй подсказки к текущему этапу интервью, чтобы пользователь лучше провёл разговор с AI-кандидатом. Пиши по-русски, конкретно и кратко. Подсказывай, что проверить дальше, какие уточнения задать и каких рискованных формулировок избегать. Не пиши готовые ответы кандидата. Верни строго JSON вида {"focus":"...","answerPlan":["..."],"keyDefinitions":["..."],"sampleAnswer":"..."}. answerPlan: 3–5 коротких действий интервьюера. keyDefinitions: 0–4 коротких определения методик интервью. sampleAnswer: 2–4 предложения с примером хорошего вопроса интервьюера.'
        : 'Ты карьерный тренер Гласно. Сгенерируй подсказки к ТЕКУЩЕМУ вопросу интервью, чтобы кандидат понял, о чём говорить, но не получил нечестную шпаргалку. ' +
          'Пиши по-русски, конкретно и кратко. Обязательно привязывайся к вопросу, роли, вакансии и резюме, если они есть. ' +
          'Не выдумывай работодателей, годы опыта, метрики, проекты, технологии и факты, которых нет в контексте. Если конкретики нет — предложи кандидату подставить свой пример или свою метрику. ' +
          'Верни строго JSON вида {"focus":"...","answerPlan":["..."],"keyDefinitions":["..."],"sampleAnswer":"..."}. ' +
          'answerPlan: 3–5 коротких тезисов. keyDefinitions: 0–4 коротких определения терминов из вопроса. sampleAnswer: 2–4 предложения от первого лица. ' +
          'sampleAnswer должен быть законченным: не заканчивай текст многоточием, оборванной фразой или незавершённым списком.',
      userText: [
        sessionContextForConverse(params.session),
        '',
        `Текущий вопрос: ${params.turn.question}`,
        '',
        `История интервью:\n${formatTurns(params.turns)}`,
      ].join('\n'),
      maxOutputTokens: 760,
      kind: 'question_hints',
      context: usageContext(params.session),
    });

    return normalizeQuestionHintDetails(raw);
  }

  async generateSampleAnswerHint(
    params: GenerateSampleAnswerHintParams
  ): Promise<{ sampleAnswer: string }> {
    const raw = await this.requestJson({
      instruction:
        'Ты карьерный тренер Гласно. Обнови только краткий пример ответа для последнего уточняющего вопроса интервьюера. ' +
        'Основной плановый вопрос остаётся прежним, поэтому не меняй тему шире уточнения. ' +
        'Пиши по-русски, 2–4 предложения от первого лица. Не выдумывай работодателей, годы опыта, метрики, проекты, технологии и факты, которых нет в контексте. ' +
        'Если конкретики нет — формулируй пример так, чтобы кандидат мог подставить свой опыт. Ответ должен быть законченным, без многоточия в конце и без оборванной мысли. Верни строго JSON вида {"sampleAnswer":"..."}.',
      userText: [
        sessionContextForConverse(params.session),
        '',
        `Плановый вопрос turn: ${params.turn.question}`,
        `Текущий уточняющий вопрос для примера ответа: ${params.targetQuestion}`,
        '',
        `Диалог по текущему turn:\n${formatDialogue(params.dialogue)}`,
        '',
        `История интервью:\n${formatTurns(params.turns)}`,
      ].join('\n'),
      maxOutputTokens: 360,
      kind: 'question_sample_hint',
      context: usageContext(params.session),
    });

    return normalizeSampleAnswerHint(raw);
  }

  async evaluateAnswer(params: EvaluateAnswerParams): Promise<{
    needsClarification: boolean;
    question?: string;
    reason?: string;
  }> {
    const raw = await this.requestJson({
      instruction:
        'Оцени ответ кандидата. Если ответ содержательный, но слишком общий (без фактов, чисел или конкретного примера), задай ОДИН короткий уточняющий вопрос. ' +
        'Если ответ бессмысленный, набор символов, односложный, «не знаю» или ответ достаточный — уточнение НЕ нужно (needsClarification=false). ' +
        'Верни строго JSON вида {"needsClarification":true,"question":"...","reason":"..."} или {"needsClarification":false,"reason":"..."}.',
      userText: `${sessionContext(params)}\n\nВопрос: ${params.turn.question}\nОтвет: ${params.answer}\n\nИстория:\n${formatTurns(params.turns)}`,
      maxOutputTokens: 220,
      kind: 'answer_eval',
      context: usageContext(params.session),
    });

    return {
      needsClarification: Boolean(raw.needsClarification),
      question: typeof raw.question === 'string' ? raw.question.trim() : undefined,
      reason: typeof raw.reason === 'string' ? raw.reason : undefined,
    };
  }

  async converse(params: ConverseParams): Promise<{
    reply: string;
    suggestMoveOn: boolean;
  }> {
    const raw = await this.requestJson({
      instruction:
        `${buildConverseInstruction(params.session)} ` +
        `${CONVERSE_MOVE_ON_RULE} ` +
        'Если предлагаешь перейти дальше — поставь suggestMoveOn=true, иначе false. ' +
        'Верни строго JSON вида {"reply":"...","suggestMoveOn":true|false}.',
      userText: buildConverseUserText(params),
      maxOutputTokens: 320,
      kind: 'interview_converse',
      context: usageContext(params.session),
    });

    const reply = typeof raw.reply === 'string' ? raw.reply.trim() : '';
    if (!reply) {
      throw apiError('E_UPSTREAM', 'Провайдер не вернул ответ интервьюера');
    }
    return {
      reply,
      suggestMoveOn: Boolean(raw.suggestMoveOn),
    };
  }

  async *converseStream(
    params: ConverseParams
  ): AsyncGenerator<string, { suggestMoveOn: boolean }, void> {
    if (!this.options.apiKey) {
      throw apiError('E_UPSTREAM', 'Провайдер обработки не настроен');
    }

    const instruction =
      `${buildConverseInstruction(params.session)} ` +
      `${CONVERSE_MOVE_ON_RULE} ` +
      'Сначала выдай ТОЛЬКО текст реплики интервьюера (без префиксов и кавычек). ' +
      `В самом конце на отдельной строке поставь ровно один служебный маркер: «${NEXT_MARKER}» — если предлагаешь перейти к следующему вопросу, иначе «${STAY_MARKER}». ` +
      'Маркер — последнее, что ты выводишь; ничего после него не пиши.';

    const model = this.options.model || DEFAULT_MODEL;
    const client = new OpenAI({
      apiKey: this.options.apiKey,
      ...(this.options.organization
        ? { organization: this.options.organization }
        : {}),
      ...(this.options.project ? { project: this.options.project } : {}),
    });

    const startedAt = Date.now();
    let full = '';
    let emitted = 0;
    let completedResponse: any = null;

    try {
      const stream = await client.responses.create({
        model,
        max_output_tokens: 380,
        stream: true,
        input: [
          {
            role: 'developer',
            content: [{ type: 'input_text', text: instruction }],
          },
          {
            role: 'user',
            content: [
              { type: 'input_text', text: buildConverseUserText(params) },
            ],
          },
        ],
      } as any);

      for await (const ev of stream as any) {
        if (ev?.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
          full += ev.delta;
          // Не выпускаем последние MARKER_GUARD символов — там может быть маркер.
          const safeLen = full.length - MARKER_GUARD;
          if (safeLen > emitted) {
            yield full.slice(emitted, safeLen);
            emitted = safeLen;
          }
        } else if (
          ev?.type === 'response.completed' ||
          ev?.type === 'response.done'
        ) {
          completedResponse =
            ev?.response && typeof ev.response === 'object' ? ev.response : null;
        } else if (ev?.type === 'response.error') {
          throw apiError(
            'E_UPSTREAM',
            ev?.error?.message || 'Ошибка потокового ответа провайдера'
          );
        }
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'data' in err) throw err;
      throw apiError(
        'E_UPSTREAM',
        'Не удалось сгенерировать ответ интервьюера',
        {
          cause: err instanceof Error ? err.message : String(err),
        }
      );
    }

    const { clean, suggestMoveOn } = splitMoveOnMarker(full);
    if (!clean) {
      throw apiError('E_UPSTREAM', 'Провайдер вернул пустой ответ интервьюера');
    }
    if (clean.length > emitted) {
      yield clean.slice(emitted);
      // eslint-disable-next-line no-useless-assignment -- поддерживаем счётчик консистентным
      emitted = clean.length;
    }

    if (this.options.recordUsage && completedResponse) {
      const usage = extractUsageAmounts(completedResponse);
      this.options.recordUsage({
        ...usageContext(params.session),
        kind: 'interview_converse_stream',
        model,
        ...usage,
        latencyMs: Date.now() - startedAt,
        requestId:
          typeof completedResponse?.id === 'string'
            ? completedResponse.id
            : null,
      });
    }

    return { suggestMoveOn };
  }

  private async requestJson(params: {
    instruction: string;
    userText: string;
    maxOutputTokens: number;
    kind: OpenAiResponsesPurpose | string;
    context: {
      userId: string | null;
      anonymousSessionId: string;
      interviewSessionId: string | null;
    };
  }): Promise<Record<string, any>> {
    if (!this.options.apiKey) {
      throw apiError('E_UPSTREAM', 'Провайдер обработки не настроен');
    }

    const model = this.options.model || DEFAULT_MODEL;
    const startedAt = Date.now();
    try {
      const response = await sendOpenAiResponsesRequest<any>({
        purpose: params.kind,
        timeoutMs: 30_000,
        apiKey: this.options.apiKey,
        organization: this.options.organization,
        project: this.options.project,
        body: {
          model,
          max_output_tokens: params.maxOutputTokens,
          input: [
            {
              role: 'developer',
              content: [{ type: 'input_text', text: params.instruction }],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: params.userText }],
            },
          ],
        },
      });

      if (this.options.recordUsage) {
        const usage = extractUsageAmounts(response);
        this.options.recordUsage({
          ...params.context,
          kind: params.kind,
          model,
          ...usage,
          latencyMs: Date.now() - startedAt,
          requestId: typeof response?.id === 'string' ? response.id : null,
        });
      }

      return parseJsonObject(extractResponsesText(response));
    } catch (err) {
      if (err && typeof err === 'object' && 'data' in err) throw err;
      throw apiError('E_UPSTREAM', 'Не удалось сгенерировать вопрос', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

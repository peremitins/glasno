import OpenAI from 'openai';
import { apiError } from '@/server/utils/errors';
import type {
  ConverseParams,
  EvaluateAnswerParams,
  GenerateHintExampleParams,
  GenerateQuestionHintsParams,
  GenerateInterviewerPlanParams,
  GenerateQuestionParams,
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
  buildInterviewerToneInstruction,
  getInterviewerGender,
} from '@/shared/interviewerVoice';
import {
  AI_CANDIDATE_ROLE_CONTRACT,
  AI_INTERVIEWER_ROLE_CONTRACT,
} from '@/shared/interviewRoleContract';
import type {
  CandidateDifficulty,
  CandidatePersona,
  InterviewerFaceId,
  InterviewFocus,
  InterviewHintExample,
  InterviewTrainingMode,
  QuestionHintDetails,
  QuestionPreferenceStatus,
  QuestionSemanticPassport,
} from '@/shared/dto';
import { QuestionSemanticPassportDto } from '@/shared/dto';
import {
  isRelayEnabled,
  sendOpenAiResponsesRequest,
  type OpenAiResponsesPurpose,
} from './openaiResponsesClient';
import { compactGeneratedText } from './textNormalization';
import { logger } from '@/server/utils/logger';
import {
  buildCandidateBehaviorContract,
  buildCandidateBehaviorSummary,
} from '@/shared/candidateBehavior';
import { canonicalInterviewQuestionKey } from '@/shared/interviewQuestion';

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
const DEFAULT_CONVERSE_MAX_OUTPUT_TOKENS = 380;
const VERBOSE_CANDIDATE_MAX_OUTPUT_TOKENS = 650;

export function resolveConverseMaxOutputTokens(session: {
  trainingMode?: InterviewTrainingMode | null;
  metadata?: Record<string, unknown> | null;
}): number {
  return session.trainingMode === 'interviewer' &&
    session.metadata?.candidatePersona === 'verbose_vague'
    ? VERBOSE_CANDIDATE_MAX_OUTPUT_TOKENS
    : DEFAULT_CONVERSE_MAX_OUTPUT_TOKENS;
}

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

interface NormalizeQuestionHintDetailsOptions {
  trainingMode?: InterviewTrainingMode;
  context?: string;
  fallbackQuestion?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeHintContext(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value : '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 1_200) || fallback;
}

function isDirectInterviewerQuestion(value: string): boolean {
  const text = value.trim();
  return (
    text.endsWith('?') &&
    !/(?:^|[\s.!?])(?:я|мы)(?=$|[\s,.!?;:])/iu.test(text)
  );
}

function normalizeInterviewerQuestionExample(
  value: unknown,
  context: string
): Extract<InterviewHintExample, { kind: 'interviewer_question' }> | null {
  const raw = asRecord(value);
  const text = compactGeneratedText(raw.mainQuestion, '', 500);
  if (!text || !isDirectInterviewerQuestion(text)) return null;

  const rawFollowUps = raw.followUps;
  if (rawFollowUps !== undefined && !Array.isArray(rawFollowUps)) return null;
  if (Array.isArray(rawFollowUps) && rawFollowUps.length > 2) return null;

  const followUps = (rawFollowUps ?? []).map((item) =>
    compactGeneratedText(item, '', 500)
  );
  if (followUps.some((question) => !isDirectInterviewerQuestion(question))) {
    return null;
  }

  return {
    kind: 'interviewer_question',
    context: normalizeHintContext(context, 'Текущий этап интервью.'),
    text,
    followUps,
  };
}

function normalizeCandidateAnswerExample(
  value: unknown,
  context: string
): Extract<InterviewHintExample, { kind: 'candidate_answer' }> {
  const raw = asRecord(value);
  const example = asRecord(raw.example);
  const sampleAnswer = normalizeSampleAnswerHint({
    sampleAnswer: example.answer ?? raw.sampleAnswer,
  }).sampleAnswer;

  return {
    kind: 'candidate_answer',
    context: normalizeHintContext(context, 'Текущий вопрос интервью.'),
    text: sampleAnswer,
  };
}

export function normalizeQuestionHintDetails(
  value: unknown,
  options: NormalizeQuestionHintDetailsOptions = {}
): QuestionHintDetails | null {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  const trainingMode = options.trainingMode ?? 'candidate';
  const context =
    options.context?.trim() ||
    options.fallbackQuestion?.trim() ||
    'Текущий вопрос интервью.';
  const isInterviewerTraining = trainingMode === 'interviewer';
  const example = isInterviewerTraining
    ? normalizeInterviewerQuestionExample(raw.example, context)
    : normalizeCandidateAnswerExample(raw, context);
  if (!example) return null;

  return {
    focus: compactGeneratedText(
      raw.focus,
      isInterviewerTraining
        ? 'Проверяет, насколько вопрос раскрывает опыт и личный вклад кандидата.'
        : 'Проверяет, насколько ответ связан с текущим вопросом и ролью.',
      260
    ),
    answerPlan: compactTextList(
      raw.answerPlan,
      isInterviewerTraining
        ? [
            'Начните с открытого вопроса по текущей теме.',
            'Уточните личный вклад кандидата.',
            'Попросите объяснить решение и результат.',
          ]
        : [
            'Коротко ответьте на сам вопрос без длинной предыстории.',
            'Добавьте один релевантный пример из опыта или учебного проекта.',
            'Назовите личное действие и понятный результат.',
          ],
      4,
      220
    ),
    keyDefinitions: compactTextList(raw.keyDefinitions, [], 4, 220),
    example,
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

function formatTurns(
  turns: InterviewTurnRecord[],
  trainingMode: InterviewTrainingMode = 'candidate'
): string {
  if (!turns.length) {
    return trainingMode === 'interviewer'
      ? 'Пока нет предыдущих этапов.'
      : 'Пока нет предыдущих вопросов.';
  }
  return turns
    .map((turn) => {
      const answer = turn.answerTranscript
        ? trainingMode === 'interviewer'
          ? `\nРеплики интервьюера на этапе: ${turn.answerTranscript}`
          : `\nОтвет кандидата: ${turn.answerTranscript}`
        : '';
      return `#${turn.index} [${turn.kind}] ${turn.question}${answer}`;
    })
    .join('\n\n');
}

function sessionContext(params: GenerateQuestionParams | EvaluateAnswerParams) {
  return sessionContextForConverse(params.session);
}

function sessionContextForConverse(session: InterviewSessionRecord) {
  const trainingMode = readTrainingMode(session);
  const focus = readInterviewFocus(session);
  const roleContext =
    trainingMode === 'interviewer'
      ? [
          buildCandidateBehaviorContract({
            persona: readCandidatePersona(session),
            difficulty: readCandidateDifficulty(session),
            notes: readCandidateNotes(session),
          }),
        ]
      : [
          `Режим интервьюера: ${session.interviewerMode}`,
          buildInterviewerToneInstruction(session.interviewerMode),
          buildInterviewerGenderInstruction(
            getInterviewerGender(readInterviewerFaceId(session))
          ),
        ];

  return [
    `Режим тренировки: ${describeTrainingMode(trainingMode)}`,
    `Роль: ${session.role || 'не указана'}`,
    `Уровень: ${session.level || 'middle'}`,
    ...roleContext,
    `Язык: ${session.language}`,
    `Компания: ${session.companyName || 'не указана'}`,
    `Вакансия: ${session.vacancyTitle || 'не указана'}`,
    `Описание вакансии: ${session.vacancyRaw || 'нет'}`,
    `Резюме кандидата: ${session.resumeRaw || 'нет'}`,
    `Фокус интервью: ${describeInterviewFocus(focus)}`,
  ].join('\n');
}

// Подсказки генерирует отдельный тренер, поэтому здесь оставляем только
// факты сценария. Императивы из контракта AI-кандидата применимы лишь к
// живому диалогу и могут заставить тренера ответить за кандидата.
function sessionContextForHints(session: InterviewSessionRecord) {
  const trainingMode = readTrainingMode(session);
  const focus = readInterviewFocus(session);
  const roleContext =
    trainingMode === 'interviewer'
      ? [
          buildCandidateBehaviorSummary({
            persona: readCandidatePersona(session),
            difficulty: readCandidateDifficulty(session),
            notes: readCandidateNotes(session),
          }),
        ]
      : [`Режим интервьюера: ${session.interviewerMode}`];

  return [
    `Режим тренировки: ${describeTrainingMode(trainingMode)}`,
    `Роль: ${session.role || 'не указана'}`,
    `Уровень: ${session.level || 'middle'}`,
    ...roleContext,
    `Язык: ${session.language}`,
    `Компания: ${session.companyName || 'не указана'}`,
    `Вакансия: ${session.vacancyTitle || 'не указана'}`,
    `Описание вакансии: ${session.vacancyRaw || 'нет'}`,
    `Резюме кандидата: ${session.resumeRaw || 'нет'}`,
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
  return session.trainingMode === 'interviewer' ? 'interviewer' : 'candidate';
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
  const isInterviewerTraining =
    readTrainingMode(params.session) === 'interviewer';
  const currentTurnLabel = isInterviewerTraining
    ? 'Текущий этап'
    : 'Текущий вопрос';
  const exchangeLabel = isInterviewerTraining
    ? 'Реплик интервьюера по этому этапу'
    : 'Реплик кандидата по этому вопросу';
  const previousMainLabel = isInterviewerTraining
    ? 'Предыдущие основные этапы (без реплик)'
    : 'Предыдущие основные вопросы (без ответов)';
  const dialogueLabel = isInterviewerTraining
    ? 'Диалог по текущему этапу'
    : 'Диалог по текущему вопросу';

  return [
    sessionContextForConverse(params.session),
    '',
    `${previousMainLabel}:\n${formatPreviousMainQuestions(params.turns, params.turn, isInterviewerTraining)}`,
    '',
    `${currentTurnLabel}: ${params.turn.question}`,
    `${exchangeLabel}: ${params.exchanges}`,
    '',
    `${dialogueLabel}:\n${formatConverseDialogue(params)}`,
  ].join('\n');
}

function formatPreviousMainQuestions(
  turns: InterviewTurnRecord[],
  currentTurn: InterviewTurnRecord,
  isInterviewerTraining = false
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
    : isInterviewerTraining
      ? 'Пока нет предыдущих основных этапов.'
      : 'Пока нет предыдущих основных вопросов.';
}

// Общая часть инструкции интервьюера (без формата вывода).
const CANDIDATE_TRAINING_CONVERSE_RULES =
  `Ты — интервьюер Гласно. ${AI_INTERVIEWER_ROLE_CONTRACT} Веди живое собеседование голосом и текстом только по ТЕКУЩЕМУ вопросу. ` +
  'Реагируй кратко (1–3 предложения), по-русски, в роли интервьюера. ' +
  'Строго соблюдай указанный пол интервьюера и грамматический род в репликах от своего лица. ' +
  'Если кандидат не понял вопрос или просит пояснить — только переформулируй вопрос проще и уточни, какой аспект опыта тебя интересует; не объясняй предметную область и не приводи готовый ответ или решение. ' +
  'Уточняй ответ только если это помогает проверить ещё не раскрытый важный аспект текущего вопроса. Не задавай уточняющие вопросы по инерции. ' +
  'Если кандидат уже раскрыл ключевой аспект, по вопросу уже было несколько содержательных уточнений или очередное уточнение не даст новой информации — не задавай следующий вопрос, а коротко предложи перейти к следующему. Не повторяй уже выясненные аспекты другими словами. ' +
  'Не пересказывай и не оценивай ответ кандидата. Вместо объяснения верни кандидата к его собственному рассуждению или предложи перейти дальше. ' +
  'СТРОГО запрещено: отвечать ВМЕСТО кандидата, подсказывать готовый ответ, решать задачу за него или демонстрировать экспертное решение — ты проверяешь кандидата, а не учишь. ' +
  'НЕ переходи к следующему вопросу из плана сам и не меняй тему. ' +
  'Решение о переходе принимает пользователь — ты только предлагаешь.';

const INTERVIEWER_TRAINING_CONVERSE_RULES =
  `Ты — AI-кандидат Гласно. ${AI_CANDIDATE_ROLE_CONTRACT} Пользователь проводит интервью и тренирует навык интервьюера. ` +
  'Отвечай как кандидат по роли, вакансии, резюме и профилю AI-кандидата. ' +
  'Пиши по-русски и естественно, без префиксов и оценок пользователя. Длину ответа определяет выбранный профиль AI-кандидата. ' +
  'Не помогай интервьюеру формулировать вопросы и не объясняй, как проводить интервью. ' +
  'Если вопрос интервьюера общий, отвечай естественно, но не раскрывай всё сам: оставляй место для уточняющих вопросов. ' +
  'Если спрашивают рискованное или некорректное, отвечай осторожно и по-человечески, без юридических лекций. ' +
  'НЕ переходи к следующей теме сам и не объявляй итог собеседования. Решение о переходе принимает пользователь.';

export function buildConverseInstruction(
  session: Pick<InterviewSessionRecord, 'trainingMode' | 'interviewerMode' | 'metadata'>,
  timeboxReminder = false
): string {
  const base = readTrainingMode(session as InterviewSessionRecord) === 'interviewer'
    ? INTERVIEWER_TRAINING_CONVERSE_RULES
    : `${CANDIDATE_TRAINING_CONVERSE_RULES} ${buildInterviewerToneInstruction(session.interviewerMode)}`;
  if (!timeboxReminder) return base;

  if (readTrainingMode(session as InterviewSessionRecord) === 'interviewer') {
    return `${base} Время текущего этапа истекло. Не управляй переходом между темами и не предлагай следующий вопрос: это решает только пользователь-интервьюер.`;
  }

  return `${base} Время на текущий вопрос истекло. В этой реплике не задавай новый вопрос и не добавляй уточнений. Заверши её коротким предложением перейти к следующему вопросу и дождись решения пользователя, например: «Отлично, этот вопрос мы достаточно обсудили. Готовы перейти к следующему?». Не переключай вопрос самостоятельно.`;
}

export const CONVERSE_MOVE_ON_RULE =
  'Предлагай перейти к следующему вопросу, не дожидаясь таймбокса, если ответ достаточно полно раскрыл важные аспекты, уточнения начинают повторяться или кандидат явно «плавает» и продолжать смысла нет (например: «Хорошо, здесь всё понятно. Готовы перейти к следующему вопросу?»).';

function buildConverseMoveOnRule(session: ConverseParams['session']): string {
  return readTrainingMode(session) === 'interviewer'
    ? 'Не предлагай перейти к следующему вопросу и всегда указывай suggestMoveOn=false: переходом управляет только пользователь-интервьюер.'
    : CONVERSE_MOVE_ON_RULE;
}

function buildConverseOutputRule(session: ConverseParams['session']): string {
  if (readTrainingMode(session) === 'interviewer') {
    return `Сначала выдай ТОЛЬКО текст реплики AI-кандидата (без префиксов и кавычек). В самом конце на отдельной строке поставь ровно один служебный маркер: «${STAY_MARKER}». Маркер — последнее, что ты выводишь; ничего после него не пиши.`;
  }

  return `Сначала выдай ТОЛЬКО текст реплики интервьюера (без префиксов и кавычек). В самом конце на отдельной строке поставь ровно один служебный маркер: «${NEXT_MARKER}» — если предлагаешь перейти к следующему вопросу, иначе «${STAY_MARKER}». Маркер — последнее, что ты выводишь; ничего после него не пиши.`;
}

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

function fallbackInterviewerQuestion(
  session: InterviewSessionRecord,
  turn: InterviewTurnRecord
): string {
  const plannedQuestion = compactGeneratedText(turn.question, '', 500);
  if (plannedQuestion && isDirectInterviewerQuestion(plannedQuestion)) {
    return plannedQuestion;
  }

  const role = compactGeneratedText(session.role, '', 160);
  return role
    ? `Расскажите, пожалуйста, о последнем релевантном проекте в роли ${role}?`
    : 'Расскажите, пожалуйста, о последнем релевантном проекте?';
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

  async generateInterviewerPlan(
    params: GenerateInterviewerPlanParams
  ): Promise<{ questions: string[] }> {
    const raw = await this.requestJson({
      instruction:
        'Ты редактор сценария интервью Гласно. Составь устойчивый план для пользователя-интервьюера: каждый пункт — конкретный основной вопрос, который пользователь сможет задать AI-кандидату. ' +
        'Расположи вопросы в логичной последовательности от знакомства и контекста к опыту, профессиональным решениям и завершению. Не дублируй вопросы пользователя. ' +
        `Верни ровно ${params.questionsCount} вопросов и строго JSON вида {"questions":["..."]}.`,
      userText: [
        `Роль: ${params.role || 'не указана'}`,
        `Уровень кандидата: ${params.level}`,
        `Фокус интервью: ${describeInterviewFocus(params.focus ?? null)}`,
        `Вакансия: ${params.vacancyTitle || 'не указана'}`,
        `Описание вакансии: ${params.vacancyText || 'нет'}`,
        `Резюме AI-кандидата: ${params.resumeText || 'нет'}`,
        `Уже добавленные вопросы пользователя: ${
          params.existingQuestions.join(' | ') || 'нет'
        }`,
      ].join('\n'),
      maxOutputTokens: Math.max(500, params.questionsCount * 130),
      kind: 'question_gen',
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
    const uniqueQuestions = Array.from(
      new Map(
        questions.map((question) => [
          canonicalInterviewQuestionKey(question),
          question,
        ])
      ).values()
    );
    const existingQuestionKeys = new Set(
      params.existingQuestions.map(canonicalInterviewQuestionKey)
    );
    if (
      uniqueQuestions.length !== params.questionsCount ||
      uniqueQuestions.some((question) =>
        existingQuestionKeys.has(canonicalInterviewQuestionKey(question))
      )
    ) {
      throw apiError('E_UPSTREAM', 'Провайдер не вернул полный план интервью');
    }
    return { questions: uniqueQuestions };
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
          'Ты редактор сценария Гласно. Сформулируй пример основного вопроса для пользователя-интервьюера по текущему пункту плана. Это внутренняя подсказка: AI-кандидат не должен произносить её и не должен начинать разговор сам. Вопрос должен проверять роль, вакансию или опыт кандидата, быть кратким и допускать уточнения. Не повторяй предыдущие вопросы. Верни строго JSON вида {"question":"..."}',
        userText: `${sessionContext(params)}\n\nИстория:\n${formatTurns(params.turns, 'interviewer')}`,
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
          `История:\n${formatTurns(params.turns, 'candidate')}`,
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
    if (readTrainingMode(params.session) === 'interviewer') {
      return this.generateInterviewerQuestionHints(params);
    }

    const exampleContext = params.turn.question.trim();
    const raw = await this.requestJson({
      instruction:
        'Ты карьерный тренер Гласно. Сгенерируй подсказки к ТЕКУЩЕМУ вопросу интервью, чтобы кандидат понял, о чём говорить, но не получил нечестную шпаргалку. ' +
        'Пиши по-русски, конкретно и кратко. Обязательно привязывайся к вопросу, роли, вакансии и резюме, если они есть. ' +
        'Не выдумывай работодателей, годы опыта, метрики, проекты, технологии и факты, которых нет в контексте. Если конкретики нет — предложи кандидату подставить свой пример или свою метрику. ' +
        'Верни строго JSON вида {"focus":"...","answerPlan":["..."],"keyDefinitions":["..."],"example":{"answer":"..."}}. ' +
        'answerPlan: 3–5 коротких тезисов. keyDefinitions: 0–4 коротких определения терминов из вопроса. example.answer: 2–4 предложения от первого лица. ' +
        'Пример должен быть законченным: не заканчивай текст многоточием, оборванной фразой или незавершённым списком.',
      userText: [
        sessionContextForHints(params.session),
        '',
        `Текущий вопрос: ${params.turn.question}`,
        '',
        `Диалог по текущему вопросу:\n${formatDialogue(params.dialogue, 'candidate')}`,
        '',
        `История интервью:\n${formatTurns(params.turns, 'candidate')}`,
      ].join('\n'),
      maxOutputTokens: 760,
      kind: 'question_hints',
      context: usageContext(params.session),
    });

    return (
      normalizeQuestionHintDetails(raw, {
        trainingMode: 'candidate',
        context: exampleContext,
      }) ??
      normalizeQuestionHintDetails(
        {},
        { trainingMode: 'candidate', context: exampleContext }
      )!
    );
  }

  async generateHintExample(
    params: GenerateHintExampleParams
  ): Promise<InterviewHintExample> {
    if (readTrainingMode(params.session) === 'interviewer') {
      return this.generateInterviewerQuestionExample(params);
    }

    const raw = await this.requestJson({
      instruction:
        'Ты карьерный тренер Гласно. Обнови только краткий пример ответа для текущего вопроса интервьюера. ' +
        'Основной плановый вопрос остаётся прежним, поэтому не меняй тему шире уточнения. ' +
        'Пиши по-русски, 2–4 предложения от первого лица. Не выдумывай работодателей, годы опыта, метрики, проекты, технологии и факты, которых нет в контексте. ' +
        'Если конкретики нет — формулируй пример так, чтобы кандидат мог подставить свой опыт. Ответ должен быть законченным, без многоточия в конце и без оборванной мысли. Верни строго JSON вида {"example":{"answer":"..."}}.',
      userText: [
        sessionContextForHints(params.session),
        '',
        `Плановый вопрос: ${params.turn.question}`,
        `Текущий вопрос для примера: ${params.exampleContext}`,
        '',
        `Диалог по текущему вопросу:\n${formatDialogue(params.dialogue, 'candidate')}`,
        '',
        `История интервью:\n${formatTurns(params.turns, 'candidate')}`,
      ].join('\n'),
      maxOutputTokens: 360,
      kind: 'question_sample_hint',
      context: usageContext(params.session),
    });

    return normalizeCandidateAnswerExample(raw, params.exampleContext);
  }

  private async generateInterviewerQuestionHints(
    params: GenerateQuestionHintsParams
  ): Promise<QuestionHintDetails> {
    const exampleContext = compactGeneratedText(
      params.turn.question,
      'Текущий этап интервью.',
      1_200
    );
    const fallbackQuestion = fallbackInterviewerQuestion(
      params.session,
      params.turn
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await this.requestJson({
        instruction:
          'Ты тренер интервьюеров Гласно. Сгенерируй подсказки к текущему этапу интервью, чтобы пользователь лучше провёл разговор с AI-кандидатом. ' +
          'Пиши по-русски, конкретно и кратко. Подсказывай, что проверить дальше, какие уточнения задать и каких рискованных формулировок избегать. ' +
          'Не пиши готовый ответ кандидата, не отвечай от первого лица и не продолжай диалог за AI-кандидата. ' +
          'Верни строго JSON вида {"focus":"...","answerPlan":["..."],"keyDefinitions":["..."],"example":{"mainQuestion":"...?","followUps":["...?"]}}. ' +
          'answerPlan: 3–5 коротких действий интервьюера. keyDefinitions: 0–4 коротких определения методик интервью. ' +
          'example.mainQuestion — ровно один прямой вопрос пользователя-интервьюера. example.followUps — от 0 до 2 прямых уточняющих вопросов. ' +
          (attempt > 0
            ? 'Предыдущий результат не прошёл проверку: верни только вопросы, без ответа кандидата и без фраз от первого лица.'
            : ''),
        userText: [
          sessionContextForHints(params.session),
          '',
          `Плановый этап: ${params.turn.question}`,
          `Контекст для примера вопроса: ${exampleContext}`,
          '',
          `Диалог по текущему этапу:\n${formatDialogue(params.dialogue, 'interviewer')}`,
          '',
          `История интервью:\n${formatTurns(params.turns, 'interviewer')}`,
        ].join('\n'),
        maxOutputTokens: 760,
        kind: 'question_hints',
        context: usageContext(params.session),
      });
      const details = normalizeQuestionHintDetails(raw, {
        trainingMode: 'interviewer',
        context: exampleContext,
        fallbackQuestion,
      });
      if (details) return details;

      logger.warn(
        {
          interviewSessionId: params.session.id,
          trainingMode: 'interviewer',
          attempt: attempt + 1,
        },
        'Invalid interviewer hint example'
      );
    }

    return {
      focus: 'Проверяет, насколько вопрос раскрывает опыт и личный вклад кандидата.',
      answerPlan: [
        'Начните с открытого вопроса по текущей теме.',
        'Уточните личный вклад кандидата.',
        'Попросите объяснить решение и результат.',
      ],
      keyDefinitions: [],
      example: {
        kind: 'interviewer_question',
        context: exampleContext,
        text: fallbackQuestion,
        followUps: [],
      },
    };
  }

  private async generateInterviewerQuestionExample(
    params: GenerateHintExampleParams
  ): Promise<Extract<InterviewHintExample, { kind: 'interviewer_question' }>> {
    const exampleContext = compactGeneratedText(
      params.exampleContext,
      params.turn.question,
      1_200
    );
    const fallbackQuestion = fallbackInterviewerQuestion(
      params.session,
      params.turn
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await this.requestJson({
        instruction:
          'Ты тренер интервьюеров Гласно. Обнови пример следующего вопроса пользователя-интервьюера с учётом последней реплики AI-кандидата. ' +
          'Не отвечай за кандидата, не пересказывай его реплику и не продолжай диалог самостоятельно. ' +
          'Верни строго JSON вида {"example":{"mainQuestion":"...?","followUps":["...?"]}}. ' +
          'example.mainQuestion — ровно один прямой вопрос пользователя-интервьюера. example.followUps — от 0 до 2 прямых уточняющих вопросов. ' +
          (attempt > 0
            ? 'Предыдущий результат не прошёл проверку: верни только вопросы, без ответа кандидата и без фраз от первого лица.'
            : ''),
        userText: [
          sessionContextForHints(params.session),
          '',
          `Плановый этап: ${params.turn.question}`,
          `Последняя реплика AI-кандидата: ${exampleContext}`,
          '',
          `Диалог по текущему этапу:\n${formatDialogue(params.dialogue, 'interviewer')}`,
          '',
          `История интервью:\n${formatTurns(params.turns, 'interviewer')}`,
        ].join('\n'),
        maxOutputTokens: 420,
        kind: 'question_sample_hint',
        context: usageContext(params.session),
      });
      const example = normalizeInterviewerQuestionExample(raw.example, exampleContext);
      if (example) return example;

      logger.warn(
        {
          interviewSessionId: params.session.id,
          trainingMode: 'interviewer',
          attempt: attempt + 1,
        },
        'Invalid interviewer hint example'
      );
    }

    return {
      kind: 'interviewer_question',
      context: exampleContext,
      text: fallbackQuestion,
      followUps: [],
    };
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
      userText: `${sessionContext(params)}\n\nВопрос: ${params.turn.question}\nОтвет: ${params.answer}\n\nИстория:\n${formatTurns(params.turns, readTrainingMode(params.session))}`,
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
        `${buildConverseInstruction(params.session, Boolean(params.timeboxReminder))} ` +
        `${buildConverseMoveOnRule(params.session)} ` +
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
      suggestMoveOn:
        readTrainingMode(params.session) === 'candidate' &&
        Boolean(raw.suggestMoveOn),
    };
  }

  async *converseStream(
    params: ConverseParams
  ): AsyncGenerator<string, { suggestMoveOn: boolean }, void> {
    if (!this.options.apiKey) {
      throw apiError('E_UPSTREAM', 'Провайдер обработки не настроен');
    }

    // Прод (РФ) достаёт OpenAI только через AI-relay, а relay проксирует лишь
    // POST /v1/responses (JSON), без SSE-стриминга. Прямой стриминговый вызов
    // ниже идёт в api.openai.com напрямую и на проде падал с «Не удалось
    // сгенерировать ответ интервьюера». Поэтому при включённом relay
    // деградируем на нестриминговый relay-путь: тот же ответ, но одним куском.
    if (isRelayEnabled()) {
      const { reply, suggestMoveOn } = await this.converse(params);
      if (reply) yield reply;
      return { suggestMoveOn };
    }

    const instruction =
      `${buildConverseInstruction(params.session, Boolean(params.timeboxReminder))} ` +
      `${buildConverseMoveOnRule(params.session)} ` +
      buildConverseOutputRule(params.session);

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
        max_output_tokens: resolveConverseMaxOutputTokens(params.session),
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

    return {
      suggestMoveOn:
        readTrainingMode(params.session) === 'candidate' && suggestMoveOn,
    };
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

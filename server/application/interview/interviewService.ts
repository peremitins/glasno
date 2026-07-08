import type {
  AppendInterviewTurnMessageRequest,
  AnswerInterviewTurnRequest,
  CreateInterviewSessionRequest,
  GenerateInterviewHintsRequest,
  InterviewDialogueMessage,
  InterviewPlan,
  InterviewPlanItem,
  InterviewSession,
  InterviewStateResponse,
  InterviewTurn,
  NextInterviewQuestionRequest,
  QuestionHintDetails,
  QuestionHintPack,
  ReplyInterviewTurnRequest,
  UpdateInterviewerRequest,
} from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import { assertOwnedInterviewSession } from './sessionOwnership';
import type { HhClient } from '@/server/interface/hh';
import type { InterviewEngine } from '@/server/interface/interviewEngine';
import type {
  InterviewRepository,
  InterviewSessionRecord,
  InterviewTurnRecord,
} from '@/server/interface/interviewRepository';
import {
  buildHintPack,
  buildInterviewPlanMetadata,
  parseInterviewSessionMetadata,
  resolveNextPlannedQuestion,
} from './interviewPlan';
import {
  avatarFromMode,
  modeFromFaceId,
} from './interviewerFace';
import { prepareInterviewSource } from './source';

export class InterviewService {
  constructor(
    private readonly deps: {
      repository: InterviewRepository;
      engine: InterviewEngine;
      hhClient: HhClient | null;
    }
  ) {}

  async createSession(params: {
    anonymousSessionId: string;
    userId?: string | null;
    input: CreateInterviewSessionRequest;
  }): Promise<InterviewStateResponse> {
    const preparedSource = await prepareInterviewSource(params.input.source, {
      hhClient: this.deps.hhClient,
    });
    const input = await this.normalizeCustomQuestionsInput({
      input: params.input,
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
      role: params.input.role || preparedSource.role,
      vacancyTitle: preparedSource.vacancyTitle,
      vacancyRaw: preparedSource.vacancyRaw,
    });

    const metadata = buildInterviewPlanMetadata({
      input,
      role: input.role || preparedSource.role,
      vacancyTitle: preparedSource.vacancyTitle,
    });

    const session = await this.deps.repository.createSession({
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
      source: preparedSource.source,
      vacancyTitle: preparedSource.vacancyTitle,
      vacancyRaw: preparedSource.vacancyRaw,
      vacancyUrl: preparedSource.vacancyUrl,
      companyName: preparedSource.companyName,
      resumeRaw: input.resumeText || null,
      role: input.role || preparedSource.role,
      level: input.level,
      questionCount: metadata.plan.items.length || 1,
      language: input.language,
      interviewerMode: input.interviewerMode,
      interviewerAvatarId: input.interviewerAvatarId,
      status: 'running',
      metadata: { ...metadata },
    });

    await this.createNextMainQuestionOrFinish(session, []);

    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  // Смена интервьюера в кабинете: новое лицо задаёт и внешность (фото-аватар),
  // и тон ИИ. Тон берётся из выбранного лица и применяется к следующим
  // репликам (replyTurnStream каждый раз перечитывает сессию).
  async updateInterviewer(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: UpdateInterviewerRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );

    const faceId = params.input.faceId;
    const mode = modeFromFaceId(faceId);
    const avatarId = avatarFromMode(mode);
    const metadata = {
      ...toMetaRecord(session.metadata),
      interviewerFaceId: faceId,
    };

    await this.deps.repository.updateSessionInterviewer(session.id, {
      interviewerMode: mode,
      interviewerAvatarId: avatarId,
      metadata,
    });

    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  private async normalizeCustomQuestionsInput(params: {
    input: CreateInterviewSessionRequest;
    anonymousSessionId: string;
    userId?: string | null;
    role?: string | null;
    vacancyTitle?: string | null;
    vacancyRaw?: string | null;
  }): Promise<CreateInterviewSessionRequest> {
    const rawText = params.input.customQuestionsText?.trim();
    if (!rawText) return params.input;

    const normalized = await this.deps.engine.normalizeCustomQuestions({
      rawText,
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
      role: params.role,
      level: params.input.level,
      vacancyTitle: params.vacancyTitle,
      vacancyRaw: params.vacancyRaw,
      resumeText: params.input.resumeText,
      questionSourceMode: params.input.questionSourceMode,
    });
    const questions = normalizeQuestionList(normalized.questions, rawText);

    return {
      ...params.input,
      customQuestionsText: questions.join('\n'),
    };
  }

  async getState(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<InterviewStateResponse> {
    return this.getStateForSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
  }

  async deleteSession(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<{ ok: true }> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    const deleted = await this.deps.repository.deleteSession(session.id);
    if (!deleted) {
      throw apiError('E_NOT_FOUND', 'Интервью не найдено');
    }
    return { ok: true };
  }

  async generateTurnHints(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: GenerateInterviewHintsRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    const normalizedMetadata = normalizeTurnMetadata(turn.metadata);
    const baseMeta = toMetaRecord(turn.metadata);
    const sampleAnswerQuestion = resolveSampleAnswerQuestion(
      turn,
      normalizedMetadata.dialogue
    );

    if (normalizedMetadata.hintPack?.detailed) {
      const detailed = normalizedMetadata.hintPack.detailed;
      const storedSampleQuestion =
        detailed.sampleAnswerQuestion || turn.question.trim();
      if (storedSampleQuestion === sampleAnswerQuestion) {
        return this.getStateForSession(
          params.anonymousSessionId,
          session.id,
          params.userId
        );
      }

      const turns = await this.deps.repository.listTurns(session.id);
      const sample = await this.deps.engine.generateSampleAnswerHint({
        session,
        turn,
        turns,
        targetQuestion: sampleAnswerQuestion,
        dialogue: normalizedMetadata.dialogue.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      await this.deps.repository.updateTurnMetadata(session.id, turn.id, {
        ...baseMeta,
        hintPack: {
          ...normalizedMetadata.hintPack,
          detailed: {
            ...detailed,
            sampleAnswerQuestion,
            sampleAnswer: sample.sampleAnswer,
          },
        },
      });

      return this.getStateForSession(
        params.anonymousSessionId,
        session.id,
        params.userId
      );
    }

    const turns = await this.deps.repository.listTurns(session.id);
    const hintPack =
      normalizedMetadata.hintPack ??
      buildHintPack({
        question: turn.question,
        role: session.role,
        vacancyTitle: session.vacancyTitle,
      });
    const detailed = await this.deps.engine.generateQuestionHints({
      session,
      turn,
      turns,
    });
    const nextDetailed: QuestionHintDetails = {
      ...detailed,
      sampleAnswerQuestion: turn.question.trim(),
    };

    if (sampleAnswerQuestion !== turn.question.trim()) {
      const sample = await this.deps.engine.generateSampleAnswerHint({
        session,
        turn,
        turns,
        targetQuestion: sampleAnswerQuestion,
        dialogue: normalizedMetadata.dialogue.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
      nextDetailed.sampleAnswerQuestion = sampleAnswerQuestion;
      nextDetailed.sampleAnswer = sample.sampleAnswer;
    }

    await this.deps.repository.updateTurnMetadata(session.id, turn.id, {
      ...baseMeta,
      hintPack: {
        ...hintPack,
        detailed: nextDetailed,
      },
    });

    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  async answerTurn(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: AnswerInterviewTurnRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    if (session.status !== 'running') {
      throw apiError('E_CONFLICT', 'Интервью уже завершено');
    }

    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }
    if (turn.answerTranscript) {
      throw apiError('E_CONFLICT', 'На этот вопрос уже есть ответ');
    }

    await this.deps.repository.saveTurnAnswer(
      session.id,
      turn.id,
      params.input.answer.trim()
    );

    const turnsAfterAnswer = await this.deps.repository.listTurns(session.id);
    // Уточняющий вопрос задаём только к содержательному ответу на основной вопрос.
    // На мусор/«не знаю»/слишком короткие ответы — не плодим уточнения, идём дальше.
    if (
      turn.kind === 'main' &&
      !hasClarificationFor(turnsAfterAnswer, turn.id) &&
      isSubstantiveAnswer(params.input.answer)
    ) {
      const evaluation = await this.deps.engine.evaluateAnswer({
        session,
        turn,
        turns: turnsAfterAnswer,
        answer: params.input.answer.trim(),
      });
      if (evaluation.needsClarification && evaluation.question?.trim()) {
        await this.deps.repository.createTurn({
          sessionId: session.id,
          index: turn.index,
          kind: 'clarification',
          question: normalizeQuestion(evaluation.question),
          followUpForTurnId: turn.id,
        });
        return this.getStateForSession(
          params.anonymousSessionId,
          session.id,
          params.userId
        );
      }
    }

    await this.createNextMainQuestionOrFinish(session, turnsAfterAnswer);
    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  // Реплика кандидата в диалоге по текущему вопросу. Интервью НЕ двигается
  // дальше — ИИ ведёт живой диалог и при необходимости предлагает перейти.
  async replyTurn(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: ReplyInterviewTurnRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    if (session.status !== 'running') {
      throw apiError('E_CONFLICT', 'Интервью уже завершено');
    }

    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    const baseMeta = toMetaRecord(turn.metadata);
    const dialogue = parseDialogue(baseMeta.dialogue);
    dialogue.push({
      role: 'user',
      content: params.input.message.trim(),
      at: new Date().toISOString(),
    });
    const exchanges = dialogue.filter((message) => message.role === 'user').length;

    const { reply, suggestMoveOn } = await this.deps.engine.converse({
      session,
      turn,
      dialogue: dialogue.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      exchanges,
    });

    dialogue.push({
      role: 'interviewer',
      content: reply,
      at: new Date().toISOString(),
    });

    await this.deps.repository.updateTurnMetadata(session.id, turn.id, {
      ...baseMeta,
      dialogue,
      suggestMoveOn,
    });

    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  // Стримовая версия replyTurn: yield'ит дельты текста ответа интервьюера по
  // мере генерации, после завершения сохраняет диалог и отдаёт финальное
  // состояние интервью. Используется для «постепенного появления» ответа.
  async *replyTurnStream(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: ReplyInterviewTurnRequest;
  }): AsyncGenerator<
    | { type: 'delta'; text: string }
    | { type: 'done'; state: InterviewStateResponse },
    void,
    void
  > {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    if (session.status !== 'running') {
      throw apiError('E_CONFLICT', 'Интервью уже завершено');
    }

    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    const baseMeta = toMetaRecord(turn.metadata);
    const dialogue = parseDialogue(baseMeta.dialogue);
    dialogue.push({
      role: 'user',
      content: params.input.message.trim(),
      at: new Date().toISOString(),
    });
    const exchanges = dialogue.filter((message) => message.role === 'user').length;

    const generator = this.deps.engine.converseStream({
      session,
      turn,
      dialogue: dialogue.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      exchanges,
    });

    let reply = '';
    // eslint-disable-next-line no-useless-assignment -- явная инициализация для читаемости
    let suggestMoveOn = false;
    while (true) {
      const next = await generator.next();
      if (next.done) {
        suggestMoveOn = next.value?.suggestMoveOn ?? false;
        break;
      }
      if (next.value) {
        reply += next.value;
        yield { type: 'delta', text: next.value };
      }
    }

    reply = reply.trim();
    if (!reply) {
      throw apiError('E_UPSTREAM', 'Провайдер не вернул ответ интервьюера');
    }

    dialogue.push({
      role: 'interviewer',
      content: reply,
      at: new Date().toISOString(),
    });

    await this.deps.repository.updateTurnMetadata(session.id, turn.id, {
      ...baseMeta,
      dialogue,
      suggestMoveOn,
    });

    const state = await this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
    yield { type: 'done', state };
  }

  // Фактическая реплика realtime-диалога. Ничего не генерируем и не двигаем:
  // только сохраняем транскрипт для чата, перехода между вопросами и отчёта.
  async appendTurnMessage(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: AppendInterviewTurnMessageRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    const content = params.input.content.trim();
    if (!content) {
      throw apiError('E_VALIDATION', 'Пустая реплика не сохраняется');
    }

    const baseMeta = toMetaRecord(turn.metadata);
    const dialogue = parseDialogue(baseMeta.dialogue);
    dialogue.push({
      role: params.input.role,
      content,
      at: new Date().toISOString(),
    });

    await this.deps.repository.updateTurnMetadata(session.id, turn.id, {
      ...baseMeta,
      dialogue,
    });

    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  // Явный переход к следующему вопросу (кнопка / голосовая команда / согласие
  // с предложением ИИ). Фиксируем ответ текущего вопроса из диалога и двигаемся.
  async nextQuestion(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: NextInterviewQuestionRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    if (session.status !== 'running') {
      throw apiError('E_CONFLICT', 'Интервью уже завершено');
    }

    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    if (!turn.answerTranscript) {
      const baseMeta = toMetaRecord(turn.metadata);
      const dialogue = parseDialogue(baseMeta.dialogue);
      const answerText = dialogue
        .filter((message) => message.role === 'user')
        .map((message) => message.content)
        .join('\n')
        .trim();
      // Пустую строку сохранять нельзя — currentTurn ищется по !answerTranscript.
      await this.deps.repository.saveTurnAnswer(
        session.id,
        turn.id,
        answerText || '—'
      );
    }

    const turnsAfter = await this.deps.repository.listTurns(session.id);
    await this.createNextMainQuestionOrFinish(session, turnsAfter);
    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  private async createNextMainQuestionOrFinish(
    session: InterviewSessionRecord,
    turns: InterviewTurnRecord[]
  ) {
    const mainTurns = turns.filter((turn) => turn.kind === 'main');
    if (mainTurns.length >= session.questionCount) {
      await this.deps.repository.updateSessionStatus(session.id, 'done');
      return;
    }

    const metadata = parseInterviewSessionMetadata(session.metadata);
    const planned = resolveNextPlannedQuestion({ metadata, turns });
    if (!planned) {
      await this.deps.repository.updateSessionStatus(session.id, 'done');
      return;
    }

    let question = planned.question;
    let hintPack = planned.hintPack;

    if (planned.source === 'glasno') {
      const generated = await this.deps.engine.generateQuestion({
        session,
        turns,
        input: {
          source: {
            type:
              session.source === 'hh_url'
                ? 'text'
                : (session.source as 'text' | 'profession'),
            text: session.vacancyRaw || session.role || 'Вакансия не указана',
            title: session.vacancyTitle || undefined,
            role: session.role || undefined,
          } as CreateInterviewSessionRequest['source'],
          resumeText: session.resumeRaw || undefined,
          role: session.role || undefined,
          level: session.level || 'middle',
          sessionGoal: metadata.sessionGoal,
          questionSourceMode: metadata.questionSourceMode,
          focus: metadata.focus ?? undefined,
          responseMode: metadata.responseMode,
          hintMode: metadata.hintMode,
          language: session.language,
          interviewerMode: session.interviewerMode,
          interviewerAvatarId: session.interviewerAvatarId,
          interviewerFaceId: metadata.interviewerFaceId,
        },
      });
      question = generated.question;
      hintPack = buildHintPack({
        question,
        role: session.role,
        vacancyTitle: session.vacancyTitle,
      });
    }

    await this.deps.repository.createTurn({
      sessionId: session.id,
      index: mainTurns.length + 1,
      kind: 'main',
      question: normalizeQuestion(question),
      metadata: {
        planItemId: planned.planItemId,
        questionSource: planned.source,
        hintPack,
      },
    });
  }

  private async getStateForSession(
    anonymousSessionId: string,
    sessionId: string,
    userId?: string | null
  ): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      anonymousSessionId,
      sessionId,
      userId
    );
    const turns = await this.deps.repository.listTurns(session.id);
    return toState(session, turns);
  }

  private async requireOwnedSession(
    anonymousSessionId: string,
    sessionId: string,
    userId?: string | null
  ): Promise<InterviewSessionRecord> {
    const session = await this.deps.repository.findSessionById(sessionId);
    return assertOwnedInterviewSession(session, { anonymousSessionId, userId });
  }
}

function normalizeQuestion(question: string): string {
  const normalized = question.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw apiError('E_UPSTREAM', 'LLM вернул пустой вопрос');
  }
  return normalized;
}

function normalizeQuestionList(questions: string[], fallbackRaw: string): string[] {
  const source = questions.length ? questions : fallbackRaw.split(/\n|;|(?<=\?)\s+/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of source) {
    const question = normalizeQuestionCandidate(item);
    if (!question || question.length < 8) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(question);
  }

  return result.slice(0, 12);
}

function normalizeQuestionCandidate(value: string): string {
  const normalized = value
    .trim()
    .replace(/^\d+[).:-]\s*/, '')
    .replace(/\s+/g, ' ');
  if (!normalized) return '';
  return /[?.!]$/.test(normalized) ? normalized : `${normalized}?`;
}

function hasClarificationFor(turns: InterviewTurnRecord[], turnId: string): boolean {
  return turns.some(
    (turn) => turn.kind === 'clarification' && turn.followUpForTurnId === turnId
  );
}

const LOW_EFFORT_ANSWER =
  /^(не\s*знаю|незнаю|не\s*уверен|ничего|хз|пропустить|пропуск|skip|нет|—|-|\.)\.?$/i;

// Содержательный ли ответ: есть смысл задавать уточняющий вопрос.
// Отсекаем слишком короткие, односложные и «не знаю»-ответы.
function isSubstantiveAnswer(answer: string): boolean {
  const text = answer.trim();
  if (text.length < 40) return false;
  if (LOW_EFFORT_ANSWER.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  return true;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toSessionDto(
  session: InterviewSessionRecord,
  turns: InterviewTurnRecord[]
): InterviewSession {
  const mainTurns = turns.filter((turn) => turn.kind === 'main');
  const metadata = parseInterviewSessionMetadata(session.metadata);
  const currentTurn = turns.find((turn) => !turn.answerTranscript) ?? null;
  const currentQuestionIndex =
    currentTurn?.kind === 'main'
      ? currentTurn.index
      : mainTurns.at(-1)?.index ?? mainTurns.length;

  return {
    id: session.id,
    status: session.status,
    source: session.source,
    vacancyTitle: session.vacancyTitle,
    vacancyUrl: session.vacancyUrl,
    companyName: session.companyName,
    role: session.role,
    level: session.level,
    questionCount: session.questionCount,
    sessionGoal: metadata.sessionGoal,
    expectedDurationMinutes: metadata.expectedDurationMinutes,
    questionSourceMode: metadata.questionSourceMode,
    focus: metadata.focus,
    responseMode: metadata.responseMode,
    hintMode: metadata.hintMode,
    realtimeLimits: metadata.realtimeLimits,
    plan: toPlanDto(metadata.plan, turns),
    language: session.language,
    interviewerMode: session.interviewerMode,
    interviewerAvatarId: session.interviewerAvatarId,
    interviewerFaceId: metadata.interviewerFaceId,
    currentQuestionIndex,
    totalQuestions: session.questionCount,
    createdAt: toIso(session.createdAt)!,
  };
}

function toTurnDto(turn: InterviewTurnRecord): InterviewTurn {
  const metadata = normalizeTurnMetadata(turn.metadata);
  return {
    id: turn.id,
    sessionId: turn.sessionId,
    index: turn.index,
    kind: turn.kind,
    question: turn.question,
    questionSource: metadata.questionSource,
    planItemId: metadata.planItemId,
    hintPack: metadata.hintPack,
    answerTranscript: turn.answerTranscript,
    followUpForTurnId: turn.followUpForTurnId,
    answeredAt: toIso(turn.answeredAt),
    createdAt: toIso(turn.createdAt)!,
    messages: metadata.dialogue,
    suggestMoveOn: metadata.suggestMoveOn,
  };
}

// Приводит metadata турна к объекту (или пустому), чтобы безопасно мёржить.
function toMetaRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object'
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

// Разбирает массив реплик диалога из metadata.
function parseDialogue(value: unknown): InterviewDialogueMessage[] {
  if (!Array.isArray(value)) return [];
  const result: InterviewDialogueMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as { role?: unknown; content?: unknown; at?: unknown };
    const role = raw.role === 'interviewer' ? 'interviewer' : 'user';
    const content = typeof raw.content === 'string' ? raw.content : '';
    if (!content) continue;
    const at = typeof raw.at === 'string' ? raw.at : new Date().toISOString();
    result.push({ role, content, at });
  }
  return result;
}

function resolveSampleAnswerQuestion(
  turn: InterviewTurnRecord,
  dialogue: InterviewDialogueMessage[]
): string {
  return latestInterviewerQuestionForHints(dialogue) ?? turn.question.trim();
}

function latestInterviewerQuestionForHints(
  dialogue: InterviewDialogueMessage[]
): string | null {
  for (let index = dialogue.length - 1; index >= 0; index -= 1) {
    const message = dialogue[index];
    if (!message) continue;
    if (message.role !== 'interviewer') continue;
    const question = extractQuestionPrompt(message.content);
    if (question && !isMoveOnPrompt(question)) return question;
  }
  return null;
}

function extractQuestionPrompt(content: string): string | null {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const questionEnd = normalized.lastIndexOf('?');
  if (questionEnd < 0) return null;

  const prefix = normalized.slice(0, questionEnd);
  const boundary = Math.max(
    prefix.lastIndexOf('.'),
    prefix.lastIndexOf('!'),
    prefix.lastIndexOf('?')
  );
  const question = normalized.slice(boundary + 1, questionEnd + 1).trim();
  return question || null;
}

function isMoveOnPrompt(question: string): boolean {
  return /следующ[а-яё]*\s+вопрос|перей[а-яё]*\s+(?:к|ко)\s+следующ|дальше/iu.test(
    question
  );
}

function toPlanDto(
  plan: InterviewPlan,
  turns: InterviewTurnRecord[]
): InterviewPlan {
  const turnsByPlanItemId = new Map<string, InterviewTurnRecord>();
  for (const turn of turns) {
    const planItemId = normalizeTurnMetadata(turn.metadata).planItemId;
    if (planItemId && turn.kind === 'main') {
      turnsByPlanItemId.set(planItemId, turn);
    }
  }

  return {
    ...plan,
    items: plan.items.map((item): InterviewPlanItem => {
      const askedTurn = turnsByPlanItemId.get(item.id);
      if (!askedTurn) return item;
      const turnMetadata = normalizeTurnMetadata(askedTurn.metadata);
      return {
        ...item,
        question: askedTurn.question,
        status: 'asked',
        hintPack: turnMetadata.hintPack ?? item.hintPack,
      };
    }),
  };
}

function normalizeTurnMetadata(metadata: unknown): {
  planItemId: string | null;
  questionSource: 'glasno' | 'user';
  hintPack: QuestionHintPack | null;
  dialogue: InterviewDialogueMessage[];
  suggestMoveOn: boolean;
} {
  if (!metadata || typeof metadata !== 'object') {
    return {
      planItemId: null,
      questionSource: 'glasno',
      hintPack: null,
      dialogue: [],
      suggestMoveOn: false,
    };
  }
  const raw = metadata as {
    planItemId?: unknown;
    questionSource?: unknown;
    hintPack?: unknown;
    dialogue?: unknown;
    suggestMoveOn?: unknown;
  };
  return {
    planItemId:
      typeof raw.planItemId === 'string' && raw.planItemId.trim()
        ? raw.planItemId
        : null,
    questionSource: raw.questionSource === 'user' ? 'user' : 'glasno',
    hintPack:
      raw.hintPack && typeof raw.hintPack === 'object'
        ? (raw.hintPack as QuestionHintPack)
        : null,
    dialogue: parseDialogue(raw.dialogue),
    suggestMoveOn: raw.suggestMoveOn === true,
  };
}

function toState(
  session: InterviewSessionRecord,
  turns: InterviewTurnRecord[]
): InterviewStateResponse {
  const turnDtos = turns.map(toTurnDto);
  return {
    session: toSessionDto(session, turns),
    turns: turnDtos,
    currentTurn:
      session.status === 'running'
        ? turnDtos.find((turn) => !turn.answerTranscript) ?? null
        : null,
  };
}

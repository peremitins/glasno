import type {
  AnswerInterviewTurnRequest,
  CreateInterviewSessionRequest,
  InterviewPlan,
  InterviewPlanItem,
  InterviewSession,
  InterviewStateResponse,
  InterviewTurn,
  QuestionHintPack,
} from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
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

    const metadata = buildInterviewPlanMetadata({
      input: params.input,
      role: params.input.role || preparedSource.role,
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
      resumeRaw: params.input.resumeText || null,
      role: params.input.role || preparedSource.role,
      level: params.input.level,
      questionCount: metadata.plan.items.length || 1,
      language: params.input.language,
      interviewerMode: params.input.interviewerMode,
      interviewerAvatarId: params.input.interviewerAvatarId,
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

    if (planned.source === 'jobai') {
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
          responseMode: metadata.responseMode,
          hintMode: metadata.hintMode,
          language: session.language,
          interviewerMode: session.interviewerMode,
          interviewerAvatarId: session.interviewerAvatarId,
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
    if (!session) {
      throw apiError('E_NOT_FOUND', 'Интервью не найдено');
    }
    const ownedByAnonymousSession = session.anonymousSessionId === anonymousSessionId;
    const ownedByUser = Boolean(userId && session.userId === userId);
    if (!ownedByAnonymousSession && !ownedByUser) {
      throw apiError('E_FORBIDDEN', 'Нет доступа к этому интервью');
    }
    return session;
  }
}

function normalizeQuestion(question: string): string {
  const normalized = question.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw apiError('E_UPSTREAM', 'LLM вернул пустой вопрос');
  }
  return normalized;
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
    responseMode: metadata.responseMode,
    hintMode: metadata.hintMode,
    realtimeLimits: metadata.realtimeLimits,
    plan: toPlanDto(metadata.plan, turns),
    language: session.language,
    interviewerMode: session.interviewerMode,
    interviewerAvatarId: session.interviewerAvatarId,
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
  };
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
  questionSource: 'jobai' | 'user';
  hintPack: QuestionHintPack | null;
} {
  if (!metadata || typeof metadata !== 'object') {
    return {
      planItemId: null,
      questionSource: 'jobai',
      hintPack: null,
    };
  }
  const raw = metadata as {
    planItemId?: unknown;
    questionSource?: unknown;
    hintPack?: unknown;
  };
  return {
    planItemId:
      typeof raw.planItemId === 'string' && raw.planItemId.trim()
        ? raw.planItemId
        : null,
    questionSource: raw.questionSource === 'user' ? 'user' : 'jobai',
    hintPack:
      raw.hintPack && typeof raw.hintPack === 'object'
        ? (raw.hintPack as QuestionHintPack)
        : null,
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

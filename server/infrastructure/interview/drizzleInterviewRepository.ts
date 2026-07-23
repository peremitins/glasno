import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/server/infrastructure/db/client';
import { apiError } from '@/server/utils/errors';
import type {
  CreateInterviewSessionRecordInput,
  CreateInterviewTurnRecordInput,
  InterviewRepository,
  InterviewOwner,
  InterviewSessionRecord,
  InterviewTurnRecord,
} from '@/server/interface/interviewRepository';
import type {
  InterviewLanguage,
  InterviewLevel,
  InterviewerAvatarId,
  InterviewerMode,
  InterviewSessionStatus,
  InterviewSourceType,
  InterviewTrainingMode,
  InterviewTurnKind,
} from '@/shared/dto';

type SessionRow = typeof schema.interviewSessions.$inferSelect;
type TurnRow = typeof schema.interviewTurns.$inferSelect;

function mapSession(row: SessionRow): InterviewSessionRecord {
  return {
    id: row.id,
    anonymousSessionId: row.anonymousSessionId,
    userId: row.userId,
    trainingMode: (row.trainingMode || 'candidate') as InterviewTrainingMode,
    source: row.source as InterviewSourceType,
    vacancyTitle: row.vacancyTitle,
    vacancyRaw: row.vacancyRaw,
    vacancyUrl: row.vacancyUrl,
    companyName: row.companyName,
    resumeRaw: row.resumeRaw,
    role: row.role,
    level: row.level as InterviewLevel | null,
    questionCount: row.questionCount || row.format || 3,
    language: row.language as InterviewLanguage,
    interviewerMode: (row.interviewerMode || 'neutral') as InterviewerMode,
    interviewerAvatarId: (row.interviewerAvatarId || 'neutral-pro') as InterviewerAvatarId,
    status: row.status as InterviewSessionStatus,
    metadata: normalizeMetadata(row.metadata),
    createdAt: row.createdAt,
  };
}

function mapTurn(row: TurnRow): InterviewTurnRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    index: row.index,
    kind: row.kind as InterviewTurnKind,
    question: row.question,
    answerTranscript: row.answerTranscript,
    followUpForTurnId: row.followUpForTurnId,
    metadata: normalizeMetadata(row.metadata),
    answeredAt: row.answeredAt,
    createdAt: row.createdAt,
  };
}

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function ownerWhere(owner: InterviewOwner) {
  if (owner.userId) return eq(schema.interviewSessions.userId, owner.userId);
  return and(
    isNull(schema.interviewSessions.userId),
    eq(schema.interviewSessions.anonymousSessionId, owner.anonymousSessionId)
  );
}

function extractCanonicalQuestionIds(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return [];
  const plan = (metadata as { plan?: unknown }).plan;
  if (!plan || typeof plan !== 'object') return [];
  const items = (plan as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const canonicalQuestionId = (
      item as { canonicalQuestionId?: unknown }
    ).canonicalQuestionId;
    const semantic = (item as { semantic?: unknown }).semantic;
    const conceptKey =
      semantic && typeof semantic === 'object'
        ? (semantic as { conceptKey?: unknown }).conceptKey
        : null;

    return [canonicalQuestionId, conceptKey].filter(
      (id): id is string => typeof id === 'string' && Boolean(id.trim())
    );
  });
}

function requireReturnedRow<T>(row: T | undefined, entity: string): T {
  if (!row) {
    throw apiError('E_UNKNOWN', `База данных не вернула ${entity}`);
  }
  return row;
}

export class DrizzleInterviewRepository implements InterviewRepository {
  private readonly db = getDb();

  async createSession(
    input: CreateInterviewSessionRecordInput
  ): Promise<InterviewSessionRecord> {
    const [row] = await this.db
      .insert(schema.interviewSessions)
      .values({
        anonymousSessionId: input.anonymousSessionId,
        userId: input.userId ?? null,
        trainingMode: input.trainingMode,
        source: input.source,
        vacancyTitle: input.vacancyTitle ?? null,
        vacancyRaw: input.vacancyRaw ?? null,
        vacancyUrl: input.vacancyUrl ?? null,
        companyName: input.companyName ?? null,
        resumeRaw: input.resumeRaw ?? null,
        role: input.role ?? null,
        level: input.level ?? null,
        format: input.questionCount,
        questionCount: input.questionCount,
        language: input.language,
        interviewerMode: input.interviewerMode,
        interviewerAvatarId: input.interviewerAvatarId,
        status: input.status,
        metadata: input.metadata ?? null,
        creatorIpHash: input.creatorIpHash ?? null,
      })
      .returning();

    return mapSession(requireReturnedRow(row, 'interview_session'));
  }

  async findSessionById(id: string): Promise<InterviewSessionRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.interviewSessions)
      .where(eq(schema.interviewSessions.id, id))
      .limit(1);
    return row ? mapSession(row) : null;
  }

  async deleteSession(id: string): Promise<boolean> {
    const [deleted] = await this.db.transaction(async (tx) => {
      const voiceSessions = await tx
        .select({ id: schema.realtimeVoiceSessions.id })
        .from(schema.realtimeVoiceSessions)
        .where(eq(schema.realtimeVoiceSessions.interviewSessionId, id));
      const voiceSessionIds = voiceSessions.map((row) => row.id);

      // Списания минут сохраняем для аудита, но они ссылаются на голосовую
      // сессию. Сначала снимаем эту ссылку, иначе PostgreSQL не даст удалить
      // realtime_voice_sessions из-за внешнего ключа.
      if (voiceSessionIds.length > 0) {
        await tx
          .update(schema.realtimeMinuteDebits)
          .set({ realtimeSessionId: null })
          .where(
            inArray(schema.realtimeMinuteDebits.realtimeSessionId, voiceSessionIds)
          );
      }

      await tx
        .delete(schema.realtimeVoiceSessions)
        .where(eq(schema.realtimeVoiceSessions.interviewSessionId, id));
      await tx
        .delete(schema.aiUsage)
        .where(eq(schema.aiUsage.interviewSessionId, id));
      await tx
        .delete(schema.interviewReports)
        .where(eq(schema.interviewReports.sessionId, id));
      await tx
        .delete(schema.interviewTurns)
        .where(eq(schema.interviewTurns.sessionId, id));

      return tx
        .delete(schema.interviewSessions)
        .where(eq(schema.interviewSessions.id, id))
        .returning({ id: schema.interviewSessions.id });
    });

    return Boolean(deleted);
  }

  async updateSessionStatus(
    id: string,
    status: InterviewSessionStatus
  ): Promise<InterviewSessionRecord | null> {
    const [row] = await this.db
      .update(schema.interviewSessions)
      .set({ status })
      .where(eq(schema.interviewSessions.id, id))
      .returning();
    return row ? mapSession(row) : null;
  }

  async completeSession(id: string): Promise<InterviewSessionRecord | null> {
    const [row] = await this.db
      .update(schema.interviewSessions)
      .set({ status: 'done' })
      .where(eq(schema.interviewSessions.id, id))
      .returning();
    return row ? mapSession(row) : null;
  }

  async updateSessionInterviewer(
    id: string,
    fields: {
      interviewerMode: InterviewerMode;
      interviewerAvatarId: InterviewerAvatarId;
      metadata: Record<string, unknown>;
    }
  ): Promise<InterviewSessionRecord | null> {
    const [row] = await this.db
      .update(schema.interviewSessions)
      .set({
        interviewerMode: fields.interviewerMode,
        interviewerAvatarId: fields.interviewerAvatarId,
        metadata: fields.metadata,
      })
      .where(eq(schema.interviewSessions.id, id))
      .returning();
    return row ? mapSession(row) : null;
  }

  async updateSessionMetadata(
    id: string,
    metadata: Record<string, unknown>
  ): Promise<InterviewSessionRecord | null> {
    const [row] = await this.db
      .update(schema.interviewSessions)
      .set({ metadata })
      .where(eq(schema.interviewSessions.id, id))
      .returning();
    return row ? mapSession(row) : null;
  }

  async listCanonicalQuestionIdsForOwner(owner: InterviewOwner): Promise<string[]> {
    const rows = await this.db
      .select({ metadata: schema.interviewSessions.metadata })
      .from(schema.interviewSessions)
      .where(ownerWhere(owner))
      .orderBy(
        asc(schema.interviewSessions.createdAt),
        asc(schema.interviewSessions.id)
      );

    return rows.flatMap((row) => extractCanonicalQuestionIds(row.metadata));
  }

  async listTurns(sessionId: string): Promise<InterviewTurnRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.interviewTurns)
      .where(eq(schema.interviewTurns.sessionId, sessionId))
      .orderBy(asc(schema.interviewTurns.createdAt), asc(schema.interviewTurns.id));
    return rows.map(mapTurn);
  }

  async findTurnById(
    sessionId: string,
    turnId: string
  ): Promise<InterviewTurnRecord | null> {
    const turns = await this.listTurns(sessionId);
    return turns.find((turn) => turn.id === turnId) ?? null;
  }

  async createTurn(
    input: CreateInterviewTurnRecordInput
  ): Promise<InterviewTurnRecord> {
    const [row] = await this.db
      .insert(schema.interviewTurns)
      .values({
        sessionId: input.sessionId,
        index: input.index,
        kind: input.kind,
        question: input.question,
        followUpForTurnId: input.followUpForTurnId ?? null,
        metadata: input.metadata ?? null,
      })
      .returning();
    return mapTurn(requireReturnedRow(row, 'interview_turn'));
  }

  async saveTurnAnswer(
    sessionId: string,
    turnId: string,
    answer: string
  ): Promise<InterviewTurnRecord | null> {
    const [row] = await this.db
      .update(schema.interviewTurns)
      .set({
        answerTranscript: answer,
        answeredAt: new Date(),
      })
      .where(eq(schema.interviewTurns.id, turnId))
      .returning();

    if (!row || row.sessionId !== sessionId) return null;
    return mapTurn(row);
  }

  async updateTurnMetadata(
    sessionId: string,
    turnId: string,
    metadata: Record<string, unknown>
  ): Promise<InterviewTurnRecord | null> {
    const [row] = await this.db
      .update(schema.interviewTurns)
      .set({ metadata })
      .where(eq(schema.interviewTurns.id, turnId))
      .returning();

    if (!row || row.sessionId !== sessionId) return null;
    return mapTurn(row);
  }
}

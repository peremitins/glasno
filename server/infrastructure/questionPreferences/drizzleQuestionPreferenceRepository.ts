import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
} from 'drizzle-orm';
import type {
  InterviewFocus,
  InterviewLevel,
  QuestionPreferenceStatus,
  QuestionSemanticPassport,
} from '@/shared/dto';
import { getDb, schema } from '@/server/infrastructure/db/client';
import type {
  QuestionPreferenceListFilters,
  QuestionPreferenceOwner,
  QuestionPreferenceRecord,
  QuestionPreferenceRepository,
  UpsertQuestionPreferenceInput,
} from '@/server/interface/questionPreferenceRepository';

type PreferenceRow = typeof schema.interviewQuestionPreferences.$inferSelect;

export class DrizzleQuestionPreferenceRepository
  implements QuestionPreferenceRepository
{
  private readonly db = getDb();

  async upsert(
    input: UpsertQuestionPreferenceInput
  ): Promise<QuestionPreferenceRecord> {
    const owner = ownerCondition(input);
    const [existing] = await this.db
      .select()
      .from(schema.interviewQuestionPreferences)
      .where(
        and(
          owner,
          eq(schema.interviewQuestionPreferences.roleKey, input.roleKey),
          eq(schema.interviewQuestionPreferences.level, input.level),
          eq(schema.interviewQuestionPreferences.conceptKey, input.conceptKey)
        )
      )
      .limit(1);
    const values = {
      userId: input.userId ?? null,
      anonymousSessionId: input.anonymousSessionId,
      status: input.status,
      question: input.question,
      conceptKey: input.conceptKey,
      semantic: input.semantic,
      roleKey: input.roleKey,
      roleLabel: input.roleLabel,
      level: input.level,
      contextTags: input.contextTags,
      focus: input.focus,
      sourceSessionId: input.sourceSessionId ?? null,
      sourceTurnId: input.sourceTurnId ?? null,
      updatedAt: new Date(),
    };

    if (existing) {
      const [updated] = await this.db
        .update(schema.interviewQuestionPreferences)
        .set(values)
        .where(eq(schema.interviewQuestionPreferences.id, existing.id))
        .returning();
      return mapRecord(requireRow(updated));
    }

    const [created] = await this.db
      .insert(schema.interviewQuestionPreferences)
      .values(values)
      .returning();
    return mapRecord(requireRow(created));
  }

  async listForOwner(
    owner: QuestionPreferenceOwner,
    filters: QuestionPreferenceListFilters = {}
  ): Promise<QuestionPreferenceRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.interviewQuestionPreferences)
      .where(
        and(
          ownerCondition(owner),
          filters.status
            ? eq(schema.interviewQuestionPreferences.status, filters.status)
            : undefined,
          filters.roleKey
            ? eq(schema.interviewQuestionPreferences.roleKey, filters.roleKey)
            : undefined,
          filters.q
            ? ilike(
                schema.interviewQuestionPreferences.question,
                `%${filters.q}%`
              )
            : undefined
        )
      )
      .orderBy(
        asc(schema.interviewQuestionPreferences.lastPracticedAt),
        desc(schema.interviewQuestionPreferences.updatedAt)
      )
      .limit(5000);
    return rows.map(mapRecord);
  }

  async updateStatus(
    id: string,
    owner: QuestionPreferenceOwner,
    status: QuestionPreferenceStatus
  ): Promise<QuestionPreferenceRecord | null> {
    const [row] = await this.db
      .update(schema.interviewQuestionPreferences)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.interviewQuestionPreferences.id, id),
          ownerCondition(owner)
        )
      )
      .returning();
    return row ? mapRecord(row) : null;
  }

  async delete(
    id: string,
    owner: QuestionPreferenceOwner
  ): Promise<boolean> {
    const rows = await this.db
      .delete(schema.interviewQuestionPreferences)
      .where(
        and(
          eq(schema.interviewQuestionPreferences.id, id),
          ownerCondition(owner)
        )
      )
      .returning({ id: schema.interviewQuestionPreferences.id });
    return rows.length > 0;
  }

  async markPracticed(ids: string[], practicedAt: Date): Promise<void> {
    if (!ids.length) return;
    const rows = await this.db
      .select({
        id: schema.interviewQuestionPreferences.id,
        practiceCount: schema.interviewQuestionPreferences.practiceCount,
      })
      .from(schema.interviewQuestionPreferences)
      .where(inArray(schema.interviewQuestionPreferences.id, ids));
    await Promise.all(
      rows.map((row) =>
        this.db
          .update(schema.interviewQuestionPreferences)
          .set({
            lastPracticedAt: practicedAt,
            practiceCount: row.practiceCount + 1,
            updatedAt: practicedAt,
          })
          .where(eq(schema.interviewQuestionPreferences.id, row.id))
      )
    );
  }
}

function ownerCondition(owner: QuestionPreferenceOwner) {
  return owner.userId
    ? eq(schema.interviewQuestionPreferences.userId, owner.userId)
    : and(
        isNull(schema.interviewQuestionPreferences.userId),
        eq(
          schema.interviewQuestionPreferences.anonymousSessionId,
          owner.anonymousSessionId
        )
      );
}

function mapRecord(row: PreferenceRow): QuestionPreferenceRecord {
  return {
    id: row.id,
    anonymousSessionId: row.anonymousSessionId,
    userId: row.userId,
    status: row.status as QuestionPreferenceStatus,
    question: row.question,
    conceptKey: row.conceptKey,
    semantic: row.semantic as QuestionSemanticPassport | null,
    roleKey: row.roleKey,
    roleLabel: row.roleLabel,
    level: row.level as InterviewLevel,
    contextTags: Array.isArray(row.contextTags)
      ? (row.contextTags as string[])
      : [],
    focus: row.focus as InterviewFocus | null,
    sourceSessionId: row.sourceSessionId,
    sourceTurnId: row.sourceTurnId,
    lastPracticedAt: row.lastPracticedAt,
    practiceCount: row.practiceCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function requireRow(row: PreferenceRow | undefined): PreferenceRow {
  if (!row) throw new Error('question preference row was not returned');
  return row;
}

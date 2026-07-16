import {
  and,
  asc,
  count,
  eq,
  ilike,
  isNotNull,
  isNull,
  inArray,
  ne,
  or,
} from 'drizzle-orm';
import type { AdminQuestionBankListQuery } from '@/shared/dto';
import { getDb, schema } from '@/server/infrastructure/db/client';
import type {
  AdminQuestionBankMetadataRecord,
  AdminQuestionBankRecord,
  AdminQuestionBankRepository,
} from '@/server/interface/adminQuestionBankRepository';

type QuestionBankRow = typeof schema.questionBank.$inferSelect;

export class DrizzleAdminQuestionBankRepository
  implements AdminQuestionBankRepository
{
  private readonly db = getDb();

  async listAdmin(
    query: AdminQuestionBankListQuery,
    options: { reviewedOnly?: boolean; conceptKeys?: string[] } = {}
  ) {
    const where = and(
      options.reviewedOnly
        ? eq(schema.questionBank.technicalReview, 'passed')
        : undefined,
      options.reviewedOnly
        ? eq(schema.questionBank.editorialReview, 'passed')
        : undefined,
      options.reviewedOnly
        ? ne(schema.questionBank.status, 'deprecated')
        : undefined,
      options.conceptKeys
        ? options.conceptKeys.length
          ? inArray(schema.questionBank.corpusId, options.conceptKeys)
          : eq(schema.questionBank.corpusId, '__no_matching_concept__')
        : undefined,
      query.q
        ? or(
            ilike(schema.questionBank.question, `%${query.q}%`),
            ilike(schema.questionBank.subtopic, `%${query.q}%`)
          )
        : undefined,
      query.role ? eq(schema.questionBank.role, query.role) : undefined,
      query.framework
        ? eq(schema.questionBank.framework, query.framework)
        : undefined,
      query.topic ? eq(schema.questionBank.topic, query.topic) : undefined,
      query.interviewType
        ? eq(schema.questionBank.interviewType, query.interviewType)
        : undefined,
      query.seniority
        ? eq(schema.questionBank.seniority, query.seniority)
        : undefined,
      query.difficulty
        ? eq(schema.questionBank.difficultyLevel, query.difficulty)
        : undefined,
      query.technicalReview
        ? eq(schema.questionBank.technicalReview, query.technicalReview)
        : undefined,
      query.editorialReview
        ? eq(schema.questionBank.editorialReview, query.editorialReview)
        : undefined,
      query.status ? eq(schema.questionBank.status, query.status) : undefined,
      query.answerState === 'with_answer'
        ? isNotNull(schema.questionBank.strongAnswer)
        : undefined,
      query.answerState === 'without_answer'
        ? isNull(schema.questionBank.strongAnswer)
        : undefined
    );
    const offset = (query.page - 1) * query.pageSize;
    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(schema.questionBank)
        .where(where)
        .orderBy(
          asc(schema.questionBank.topic),
          asc(schema.questionBank.seniority),
          asc(schema.questionBank.question)
        )
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(schema.questionBank)
        .where(where),
    ]);

    return {
      rows: rows.map(mapRow),
      total: Number(totalRows[0]?.value ?? 0),
    };
  }

  async listAdminMetadata(
    options: { reviewedOnly?: boolean } = {}
  ): Promise<AdminQuestionBankMetadataRecord[]> {
    const rows = await this.db
      .select({
        role: schema.questionBank.role,
        framework: schema.questionBank.framework,
        topic: schema.questionBank.topic,
        interviewType: schema.questionBank.interviewType,
        seniority: schema.questionBank.seniority,
        technicalReview: schema.questionBank.technicalReview,
        editorialReview: schema.questionBank.editorialReview,
        status: schema.questionBank.status,
        strongAnswer: schema.questionBank.strongAnswer,
        isPublic: schema.questionBank.isPublic,
      })
      .from(schema.questionBank)
      .where(
        options.reviewedOnly
          ? and(
              eq(schema.questionBank.technicalReview, 'passed'),
              eq(schema.questionBank.editorialReview, 'passed'),
              ne(schema.questionBank.status, 'deprecated')
            )
          : undefined
      );

    return rows.map((row) => ({
      role: row.role,
      framework: row.framework as AdminQuestionBankMetadataRecord['framework'],
      topic: row.topic,
      interviewType:
        row.interviewType as AdminQuestionBankMetadataRecord['interviewType'],
      seniority: row.seniority as AdminQuestionBankMetadataRecord['seniority'],
      technicalReview:
        row.technicalReview as AdminQuestionBankMetadataRecord['technicalReview'],
      editorialReview:
        row.editorialReview as AdminQuestionBankMetadataRecord['editorialReview'],
      status: row.status as AdminQuestionBankMetadataRecord['status'],
      hasAnswer: Boolean(row.strongAnswer),
      isPublic: row.isPublic,
    }));
  }
}

function mapRow(row: QuestionBankRow): AdminQuestionBankRecord {
  return {
    id: row.id,
    corpusId: row.corpusId,
    slug: row.slug,
    role: row.role,
    framework: row.framework as AdminQuestionBankRecord['framework'],
    topic: row.topic,
    subtopic: row.subtopic,
    interviewType:
      row.interviewType as AdminQuestionBankRecord['interviewType'],
    seniority: row.seniority as AdminQuestionBankRecord['seniority'],
    difficultyLevel: row.difficultyLevel,
    question: row.question,
    variants: (row.variants ?? []) as string[],
    strongAnswer: row.strongAnswer,
    answerFormat: row.answerFormat as AdminQuestionBankRecord['answerFormat'],
    tags: (row.tags ?? []) as string[],
    expectedConcepts: (row.expectedConcepts ?? []) as string[],
    status: row.status as AdminQuestionBankRecord['status'],
    technicalReview:
      row.technicalReview as AdminQuestionBankRecord['technicalReview'],
    editorialReview:
      row.editorialReview as AdminQuestionBankRecord['editorialReview'],
    provenance: row.provenance as AdminQuestionBankRecord['provenance'],
    isPublic: row.isPublic,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

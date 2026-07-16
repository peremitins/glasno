import { and, asc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { getDb, schema } from '@/server/infrastructure/db/client';
import type {
  CanonicalQuestionCandidateQuery,
  CanonicalQuestionRecord,
  CanonicalQuestionRepository,
} from '@/server/interface/canonicalQuestionRepository';

type QuestionBankRow = typeof schema.questionBank.$inferSelect;

export class DrizzleCanonicalQuestionRepository
  implements CanonicalQuestionRepository
{
  private readonly db = getDb();

  async listCandidates(query: CanonicalQuestionCandidateQuery) {
    if (query.roleKey !== 'it-frontend') return [];
    const rows = await this.db
      .select()
      .from(schema.questionBank)
      .where(
        and(
          eq(schema.questionBank.role, 'Frontend Developer'),
          eq(schema.questionBank.seniority, query.seniority),
          inArray(schema.questionBank.framework, query.frameworks),
          inArray(schema.questionBank.interviewType, query.interviewTypes),
          eq(schema.questionBank.technicalReview, 'passed'),
          eq(schema.questionBank.editorialReview, 'passed'),
          ne(schema.questionBank.status, 'deprecated'),
          isNotNull(schema.questionBank.corpusId)
        )
      )
      .orderBy(
        asc(schema.questionBank.topic),
        asc(schema.questionBank.subtopic),
        asc(schema.questionBank.question),
        asc(schema.questionBank.id)
      )
      .limit(240);
    return rows.map(mapRow);
  }

  async findCanonicalById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.questionBank)
      .where(
        and(
          eq(schema.questionBank.id, id),
          eq(schema.questionBank.technicalReview, 'passed'),
          eq(schema.questionBank.editorialReview, 'passed'),
          ne(schema.questionBank.status, 'deprecated'),
          isNotNull(schema.questionBank.corpusId)
        )
      )
      .limit(1);
    return row ? mapRow(row) : null;
  }
}

function mapRow(row: QuestionBankRow): CanonicalQuestionRecord {
  if (!row.corpusId) throw new Error('У канонического вопроса нет corpusId');
  return {
    id: row.id,
    corpusId: row.corpusId,
    roleKey: 'it-frontend',
    roleLabel: 'Frontend-разработчик',
    framework: row.framework as CanonicalQuestionRecord['framework'],
    seniority: row.seniority as CanonicalQuestionRecord['seniority'],
    interviewType:
      row.interviewType as CanonicalQuestionRecord['interviewType'],
    topic: row.topic ?? 'other',
    subtopic: row.subtopic,
    question: row.question,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    expectedConcepts: Array.isArray(row.expectedConcepts)
      ? (row.expectedConcepts as string[])
      : [],
  };
}

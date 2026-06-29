import { and, eq, ilike } from 'drizzle-orm';
import { getDb, schema } from '@/server/infrastructure/db/client';
import type {
  QuestionBankRecord,
  QuestionBankRepository,
} from '@/server/interface/questionBankRepository';
import type {
  QuestionBankListQuery,
  QuestionBankType,
  QuestionDifficulty,
} from '@/shared/dto';

type QuestionBankRow = typeof schema.questionBank.$inferSelect;

function mapQuestion(row: QuestionBankRow): QuestionBankRecord {
  return {
    id: row.id,
    slug: row.slug,
    domain: row.domain,
    role: row.role,
    type: row.type as QuestionBankType,
    difficulty: row.difficulty as QuestionDifficulty,
    question: row.question,
    strongAnswer: row.strongAnswer,
    commonMistakes: row.commonMistakes,
    isPublic: row.isPublic,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleQuestionBankRepository implements QuestionBankRepository {
  private readonly db = getDb();

  async listPublic(filters: QuestionBankListQuery): Promise<QuestionBankRecord[]> {
    const where = and(
      eq(schema.questionBank.isPublic, true),
      filters.domain ? eq(schema.questionBank.domain, filters.domain) : undefined,
      filters.role ? eq(schema.questionBank.role, filters.role) : undefined,
      filters.type ? eq(schema.questionBank.type, filters.type) : undefined,
      filters.q ? ilike(schema.questionBank.question, `%${filters.q}%`) : undefined
    );

    const rows = await this.db
      .select()
      .from(schema.questionBank)
      .where(where)
      .limit(200);

    return rows.map(mapQuestion);
  }

  async findPublicBySlug(slug: string): Promise<QuestionBankRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.questionBank)
      .where(
        and(eq(schema.questionBank.isPublic, true), eq(schema.questionBank.slug, slug))
      )
      .limit(1);
    return row ? mapQuestion(row) : null;
  }
}


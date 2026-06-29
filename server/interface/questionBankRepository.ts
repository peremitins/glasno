import type {
  QuestionBankListQuery,
  QuestionBankType,
  QuestionDifficulty,
} from '@/shared/dto';

export interface QuestionBankRecord {
  id: string;
  slug: string | null;
  domain: string;
  role: string | null;
  type: QuestionBankType;
  difficulty: QuestionDifficulty;
  question: string;
  strongAnswer: string | null;
  commonMistakes: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface QuestionBankRepository {
  listPublic(filters: QuestionBankListQuery): Promise<QuestionBankRecord[]>;
  findPublicBySlug(slug: string): Promise<QuestionBankRecord | null>;
}


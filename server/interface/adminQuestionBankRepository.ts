import type {
  AdminQuestionBankListQuery,
  QuestionBankContentStatus,
  QuestionBankFramework,
  QuestionBankInterviewType,
  QuestionBankProvenance,
  QuestionBankReviewStatus,
  QuestionBankSeniority,
} from '@/shared/dto';

export interface AdminQuestionBankRecord {
  id: string;
  corpusId: string | null;
  slug: string | null;
  role: string | null;
  framework: QuestionBankFramework;
  topic: string | null;
  subtopic: string | null;
  interviewType: QuestionBankInterviewType;
  seniority: QuestionBankSeniority;
  difficultyLevel: number;
  question: string;
  variants: string[];
  strongAnswer: string | null;
  answerFormat: 'plain' | 'markdown' | null;
  tags: string[];
  expectedConcepts: string[];
  status: QuestionBankContentStatus;
  technicalReview: QuestionBankReviewStatus;
  editorialReview: QuestionBankReviewStatus;
  provenance: QuestionBankProvenance | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface AdminQuestionBankMetadataRecord {
  role: string | null;
  framework: QuestionBankFramework;
  topic: string | null;
  interviewType: QuestionBankInterviewType;
  seniority: QuestionBankSeniority;
  technicalReview: QuestionBankReviewStatus;
  editorialReview: QuestionBankReviewStatus;
  status: QuestionBankContentStatus;
  hasAnswer: boolean;
  isPublic: boolean;
}

export interface AdminQuestionBankRepository {
  listAdmin(
    query: AdminQuestionBankListQuery,
    options?: {
      reviewedOnly?: boolean;
      conceptKeys?: string[];
    }
  ): Promise<{
    rows: AdminQuestionBankRecord[];
    total: number;
  }>;
  listAdminMetadata(options?: {
    reviewedOnly?: boolean;
  }): Promise<AdminQuestionBankMetadataRecord[]>;
}

import type {
  InterviewFocus,
  InterviewLevel,
  QuestionPreferenceStatus,
  QuestionSemanticPassport,
} from '@/shared/dto';

export interface QuestionPreferenceOwner {
  anonymousSessionId: string;
  userId?: string | null;
}

export interface QuestionPreferenceRecord {
  id: string;
  anonymousSessionId: string;
  userId: string | null;
  status: QuestionPreferenceStatus;
  question: string;
  conceptKey: string;
  semantic: QuestionSemanticPassport | null;
  roleKey: string;
  roleLabel: string;
  level: InterviewLevel;
  contextTags: string[];
  focus: InterviewFocus | null;
  sourceSessionId: string | null;
  sourceTurnId: string | null;
  lastPracticedAt: Date | null;
  practiceCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertQuestionPreferenceInput
  extends QuestionPreferenceOwner {
  status: QuestionPreferenceStatus;
  question: string;
  conceptKey: string;
  semantic: QuestionSemanticPassport | null;
  roleKey: string;
  roleLabel: string;
  level: InterviewLevel;
  contextTags: string[];
  focus: InterviewFocus | null;
  sourceSessionId?: string | null;
  sourceTurnId?: string | null;
}

export interface QuestionPreferenceListFilters {
  status?: QuestionPreferenceStatus;
  q?: string;
  roleKey?: string;
}

export interface QuestionPreferenceRepository {
  upsert(
    input: UpsertQuestionPreferenceInput
  ): Promise<QuestionPreferenceRecord>;
  listForOwner(
    owner: QuestionPreferenceOwner,
    filters?: QuestionPreferenceListFilters
  ): Promise<QuestionPreferenceRecord[]>;
  updateStatus(
    id: string,
    owner: QuestionPreferenceOwner,
    status: QuestionPreferenceStatus
  ): Promise<QuestionPreferenceRecord | null>;
  delete(id: string, owner: QuestionPreferenceOwner): Promise<boolean>;
  markPracticed(ids: string[], practicedAt: Date): Promise<void>;
}

import type {
  InterviewFocus,
  InterviewLevel,
  QuestionBankFramework,
  QuestionBankInterviewType,
} from '@/shared/dto';

export interface CanonicalQuestionRecord {
  id: string;
  corpusId: string;
  roleKey: string;
  roleLabel: string;
  framework: QuestionBankFramework;
  seniority: InterviewLevel;
  interviewType: QuestionBankInterviewType;
  topic: string;
  subtopic: string | null;
  question: string;
  tags: string[];
  expectedConcepts: string[];
}

export interface CanonicalQuestionCandidateQuery {
  roleKey: string;
  seniority: InterviewLevel;
  frameworks: QuestionBankFramework[];
  interviewTypes: QuestionBankInterviewType[];
}

export interface CanonicalQuestionSelectionContext {
  roleKey: string;
  level: InterviewLevel;
  contextTags: string[];
  focus: InterviewFocus | null;
  sourceText: string;
}

export interface CanonicalQuestionRepository {
  listCandidates(
    query: CanonicalQuestionCandidateQuery
  ): Promise<CanonicalQuestionRecord[]>;
  findCanonicalById(id: string): Promise<CanonicalQuestionRecord | null>;
}

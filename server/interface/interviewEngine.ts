import type {
  CreateInterviewSessionRequest,
  InterviewLevel,
  InterviewQuestionSourceMode,
} from '@/shared/dto';
import type {
  InterviewSessionRecord,
  InterviewTurnRecord,
} from './interviewRepository';

export interface GenerateQuestionParams {
  session: InterviewSessionRecord;
  turns: InterviewTurnRecord[];
  input: CreateInterviewSessionRequest;
}

export interface EvaluateAnswerParams {
  session: InterviewSessionRecord;
  turn: InterviewTurnRecord;
  turns: InterviewTurnRecord[];
  answer: string;
}

export interface NormalizeCustomQuestionsParams {
  rawText: string;
  anonymousSessionId: string;
  userId?: string | null;
  role?: string | null;
  level?: InterviewLevel | null;
  vacancyTitle?: string | null;
  vacancyRaw?: string | null;
  resumeText?: string | null;
  questionSourceMode?: InterviewQuestionSourceMode | null;
}

export interface InterviewEngine {
  normalizeCustomQuestions(
    params: NormalizeCustomQuestionsParams
  ): Promise<{ questions: string[] }>;
  generateQuestion(params: GenerateQuestionParams): Promise<{ question: string }>;
  evaluateAnswer(params: EvaluateAnswerParams): Promise<{
    needsClarification: boolean;
    question?: string;
    reason?: string;
  }>;
}

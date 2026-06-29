import type { CreateInterviewSessionRequest } from '@/shared/dto';
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

export interface InterviewEngine {
  generateQuestion(params: GenerateQuestionParams): Promise<{ question: string }>;
  evaluateAnswer(params: EvaluateAnswerParams): Promise<{
    needsClarification: boolean;
    question?: string;
    reason?: string;
  }>;
}

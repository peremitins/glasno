import type {
  CreateInterviewSessionRequest,
  InterviewFocus,
  InterviewHintExample,
  InterviewLevel,
  InterviewQuestionSourceMode,
  QuestionHintDetails,
  QuestionSemanticPassport,
} from '@/shared/dto';
import type {
  InterviewSessionRecord,
  InterviewTurnRecord,
} from './interviewRepository';

export interface GenerateQuestionParams {
  session: InterviewSessionRecord;
  turns: InterviewTurnRecord[];
  input: CreateInterviewSessionRequest;
  questionPreferences?: Array<{
    id: string;
    status: 'repeat' | 'hidden';
    question: string;
    semantic: QuestionSemanticPassport | null;
  }>;
  questionContextTags?: string[];
}

export interface EvaluateAnswerParams {
  session: InterviewSessionRecord;
  turn: InterviewTurnRecord;
  turns: InterviewTurnRecord[];
  answer: string;
}

export interface ConverseParams {
  session: InterviewSessionRecord;
  turn: InterviewTurnRecord;
  // Все turns текущей сессии: для компактной ориентации без полного чата.
  turns: InterviewTurnRecord[];
  // Полный диалог по текущему вопросу (последняя реплика — кандидата).
  dialogue: Array<{ role: 'user' | 'interviewer'; content: string }>;
  // Сколько реплик кандидата уже было по этому вопросу.
  exchanges: number;
  // Время текущего вопроса истекло: в этой реплике нужно предложить перейти
  // дальше, не переключая вопрос самостоятельно.
  timeboxReminder?: boolean;
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

export interface GenerateInterviewerPlanParams {
  anonymousSessionId: string;
  userId?: string | null;
  role?: string | null;
  vacancyTitle?: string | null;
  vacancyText?: string | null;
  resumeText?: string | null;
  level: InterviewLevel;
  focus?: InterviewFocus | null;
  questionsCount: number;
  existingQuestions: string[];
}

export interface GenerateQuestionHintsParams {
  session: InterviewSessionRecord;
  turn: InterviewTurnRecord;
  turns: InterviewTurnRecord[];
  dialogue: Array<{ role: 'user' | 'interviewer'; content: string }>;
}

export interface GenerateHintExampleParams {
  session: InterviewSessionRecord;
  turn: InterviewTurnRecord;
  turns: InterviewTurnRecord[];
  exampleContext: string;
  dialogue: Array<{ role: 'user' | 'interviewer'; content: string }>;
}

export interface InterviewEngine {
  normalizeCustomQuestions(
    params: NormalizeCustomQuestionsParams
  ): Promise<{ questions: string[] }>;
  generateInterviewerPlan?(
    params: GenerateInterviewerPlanParams
  ): Promise<{ questions: string[] }>;
  generateQuestion(params: GenerateQuestionParams): Promise<{
    question: string;
    semantic?: QuestionSemanticPassport | null;
  }>;
  generateQuestionHints(
    params: GenerateQuestionHintsParams
  ): Promise<QuestionHintDetails>;
  // Переходный optional-контракт: production-движок реализует его, а старые
  // тестовые/внешние адаптеры получают безопасный fallback из плана.
  generateHintExample?(
    params: GenerateHintExampleParams
  ): Promise<InterviewHintExample>;
  evaluateAnswer(params: EvaluateAnswerParams): Promise<{
    needsClarification: boolean;
    question?: string;
    reason?: string;
  }>;
  // Живой диалог интервьюера по текущему вопросу (без перехода дальше).
  converse(params: ConverseParams): Promise<{
    reply: string;
    suggestMoveOn: boolean;
  }>;
  // Стримовая версия converse: yield'ит фрагменты текста ответа по мере
  // генерации и возвращает итоговый флаг suggestMoveOn после завершения.
  converseStream(
    params: ConverseParams
  ): AsyncGenerator<string, { suggestMoveOn: boolean }, void>;
}

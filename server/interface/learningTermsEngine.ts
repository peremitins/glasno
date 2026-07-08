import type {
  ExplainLearningTermRequest,
  ExplainLearningTermResponse,
} from '@/shared/dto';

export type LearningTermsEngineUsageContext = {
  anonymousSessionId: string;
  userId: string | null;
};

export interface LearningTermsEngine {
  explainTerm(
    input: ExplainLearningTermRequest,
    usageContext?: LearningTermsEngineUsageContext
  ): Promise<ExplainLearningTermResponse>;
}

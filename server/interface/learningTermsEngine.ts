import type {
  ExplainLearningTermRequest,
  ExplainLearningTermResponse,
  ExtractLearningTermsRequest,
  ExtractLearningTermsResponse,
} from '@/shared/dto';

export type LearningTermsEngineUsageContext = {
  anonymousSessionId: string;
  userId: string | null;
};

export interface LearningTermsEngine {
  extractTerms(
    input: ExtractLearningTermsRequest,
    usageContext?: LearningTermsEngineUsageContext
  ): Promise<ExtractLearningTermsResponse>;
  explainTerm(
    input: ExplainLearningTermRequest,
    usageContext?: LearningTermsEngineUsageContext
  ): Promise<ExplainLearningTermResponse>;
}

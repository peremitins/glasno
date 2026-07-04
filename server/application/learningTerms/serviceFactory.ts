import type { H3Event } from 'h3';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import { recordAiUsageSafe } from '@/server/application/aiUsage/serviceFactory';
import { DrizzleInterviewRepository } from '@/server/infrastructure/interview/drizzleInterviewRepository';
import { DrizzleReportRepository } from '@/server/infrastructure/reports/drizzleReportRepository';
import { OpenAiLearningTermsEngine } from '@/server/infrastructure/llm/openaiLearningTermsEngine';
import { LearningTermsService } from './learningTermsService';

export function createLearningTermsService(event: H3Event): LearningTermsService {
  const config = useRuntimeConfig(event);
  const openai = resolveOpenAiConfig(config);

  return new LearningTermsService({
    interviewRepository: new DrizzleInterviewRepository(),
    reportRepository: new DrizzleReportRepository(),
    engine: new OpenAiLearningTermsEngine({
      apiKey: openai.apiKey,
      model: openai.model,
      organization:
        process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID || null,
      project:
        process.env.NUXT_OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT_ID || null,
      recordUsage: recordAiUsageSafe,
    }),
  });
}

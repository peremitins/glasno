import type { H3Event } from 'h3';
import { InterviewService } from './interviewService';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import { HhHttpClient } from '@/server/infrastructure/hh/hhClient';
import { DrizzleInterviewRepository } from '@/server/infrastructure/interview/drizzleInterviewRepository';
import { OpenAiInterviewEngine } from '@/server/infrastructure/llm/openaiInterviewEngine';
import { recordAiUsageSafe } from '@/server/application/aiUsage/serviceFactory';
import { DrizzleQuestionPreferenceRepository } from '@/server/infrastructure/questionPreferences/drizzleQuestionPreferenceRepository';
import { DrizzleCanonicalQuestionRepository } from '@/server/infrastructure/questionBank/drizzleCanonicalQuestionRepository';
import { BillingAccessService } from '@/server/application/billing/accessService';
import { DrizzleBillingRepository } from '@/server/infrastructure/billing/drizzleBillingRepository';

export function createInterviewService(event: H3Event): InterviewService {
  const config = useRuntimeConfig(event);
  const openai = resolveOpenAiConfig(config);

  return new InterviewService({
    repository: new DrizzleInterviewRepository(),
    questionPreferenceRepository: new DrizzleQuestionPreferenceRepository(),
    canonicalQuestionRepository: new DrizzleCanonicalQuestionRepository(),
    hhClient: new HhHttpClient(config.hhApiBaseUrl as string, {
      accessToken: config.hhAccessToken as string,
      clientId: config.hhClientId as string,
      clientSecret: config.hhClientSecret as string,
    }),
    engine: new OpenAiInterviewEngine({
      apiKey: openai.apiKey,
      model: openai.model,
      organization:
        process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID || null,
      project:
        process.env.NUXT_OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT_ID || null,
      recordUsage: recordAiUsageSafe,
    }),
    // Дёргается только в момент исчерпания бюджета триала: пользователь мог
    // оформить доступ прямо во время интервью.
    hasPaidAccess: async (owner) => {
      const status = await new BillingAccessService({
        repository: new DrizzleBillingRepository(),
      }).getStatus({
        anonymousSessionId: owner.anonymousSessionId,
        userId: owner.userId,
        role: null,
      });
      return status.unlimited || status.hasActivePaidAccess;
    },
  });
}

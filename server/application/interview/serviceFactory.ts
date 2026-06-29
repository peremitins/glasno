import type { H3Event } from 'h3';
import { InterviewService } from './interviewService';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import { HhHttpClient } from '@/server/infrastructure/hh/hhClient';
import { DrizzleInterviewRepository } from '@/server/infrastructure/interview/drizzleInterviewRepository';
import { OpenAiInterviewEngine } from '@/server/infrastructure/llm/openaiInterviewEngine';
import { recordAiUsageSafe } from '@/server/application/aiUsage/serviceFactory';

export function createInterviewService(event: H3Event): InterviewService {
  const config = useRuntimeConfig(event);
  const openai = resolveOpenAiConfig(config);

  return new InterviewService({
    repository: new DrizzleInterviewRepository(),
    hhClient: new HhHttpClient(config.hhApiBaseUrl as string),
    engine: new OpenAiInterviewEngine({
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

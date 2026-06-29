import type { H3Event } from 'h3';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import { DrizzleInterviewRepository } from '@/server/infrastructure/interview/drizzleInterviewRepository';
import { OpenAiReportEngine } from '@/server/infrastructure/llm/openaiReportEngine';
import { DrizzleReportRepository } from '@/server/infrastructure/reports/drizzleReportRepository';
import { recordAiUsageSafe } from '@/server/application/aiUsage/serviceFactory';
import { ReportService } from './reportService';

export function createReportService(event: H3Event): ReportService {
  const config = useRuntimeConfig(event);
  const openai = resolveOpenAiConfig(config);

  return new ReportService({
    interviewRepository: new DrizzleInterviewRepository(),
    reportRepository: new DrizzleReportRepository(),
    engine: new OpenAiReportEngine({
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

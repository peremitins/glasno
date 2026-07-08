import { z } from 'zod';
import { InterviewTurnKindDto } from './interview';

export const ReportStatusDto = z.enum(['queued', 'processing', 'done', 'failed']);

// Три холистических критерия оценки ответа. Содержание («суть» + «структура»)
// весит больше подачи — это соответствует данным о предсказательной ценности
// структурированных интервью.
export const ReportCriteriaDto = z.object({
  // Ответил ли по существу вопроса, с конкретикой и измеримым результатом.
  substance: z.number().int().min(0).max(100),
  // Логика изложения: ситуация → задача → действие → результат, без воды.
  structure: z.number().int().min(0).max(100),
  // Подача: уверенность формулировок, без риск-фраз и слов-паразитов.
  delivery: z.number().int().min(0).max(100),
});

export const ReportRecommendationsDto = z.object({
  topFixes: z.array(z.string().min(1)).min(1).max(5),
});

export const ReportQuestionAnalysisDto = z.object({
  turnId: z.string(),
  kind: InterviewTurnKindDto.default('main'),
  question: z.string(),
  answer: z.string(),
  // .catch(null): устаревшие отчёты с прежним набором критериев не должны
  // ронять чтение — просто не показываем по ним оценки.
  criteria: ReportCriteriaDto.nullable().default(null).catch(null),
  whatWorked: z.string(),
  whatWeak: z.string(),
  // Возможный сильный ответ на этот вопрос (по STAR, с конкретикой).
  // optional+default — для обратной совместимости со старыми отчётами без поля.
  modelAnswer: z.string().optional().default(''),
  strongerAnswerStar: z.string(),
  nextPractice: z.string(),
});

export const ReportAnalysisDto = z.object({
  overallScore: z.number().int().min(0).max(100),
  verdict: z.string().min(1),
  summary: z.string().min(1),
  criteria: ReportCriteriaDto,
  recommendations: ReportRecommendationsDto,
  questionAnalysis: z.array(ReportQuestionAnalysisDto).min(1),
  model: z.string().optional(),
});

export const InterviewReportDto = z.object({
  id: z.string(),
  sessionId: z.string(),
  status: ReportStatusDto,
  overallScore: z.number().int().min(0).max(100).nullable(),
  verdict: z.string().nullable(),
  summary: z.string().nullable(),
  criteria: ReportCriteriaDto.nullable().catch(null),
  recommendations: ReportRecommendationsDto.nullable(),
  questionAnalysis: z.array(ReportQuestionAnalysisDto).nullable(),
  errorMessage: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const InterviewReportResponseDto = z.object({
  report: InterviewReportDto.nullable(),
});

export type ReportStatus = z.infer<typeof ReportStatusDto>;
export type ReportCriteria = z.infer<typeof ReportCriteriaDto>;
export type ReportRecommendations = z.infer<typeof ReportRecommendationsDto>;
export type ReportQuestionAnalysis = z.infer<typeof ReportQuestionAnalysisDto>;
export type ReportAnalysis = z.infer<typeof ReportAnalysisDto>;
export type InterviewReport = z.infer<typeof InterviewReportDto>;
export type InterviewReportResponse = z.infer<typeof InterviewReportResponseDto>;

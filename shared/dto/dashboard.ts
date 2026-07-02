import { z } from 'zod';
import {
  InterviewFocusDto,
  InterviewLevelDto,
  InterviewerModeDto,
  InterviewSessionStatusDto,
} from './interview';
import { ReportStatusDto } from './report';

export const InterviewHistoryReportDto = z.object({
  id: z.string(),
  status: ReportStatusDto,
  overallScore: z.number().int().min(0).max(100).nullable(),
  topFixes: z.array(z.string()).default([]),
});

export const InterviewHistoryItemDto = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  status: InterviewSessionStatusDto,
  role: z.string().nullable(),
  level: InterviewLevelDto.nullable(),
  interviewerMode: InterviewerModeDto,
  answeredQuestions: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  createdAt: z.string(),
  report: InterviewHistoryReportDto.nullable(),
});

export const InterviewHistoryResponseDto = z.object({
  items: z.array(InterviewHistoryItemDto),
});

export const DashboardQuickScenarioDto = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  sourceType: z.enum(['profession', 'text', 'hh_url']),
  // Тип сценария универсален для любой профессии — конкретную роль/вакансию
  // пользователь указывает сам на экране создания интервью.
  focus: InterviewFocusDto,
  role: z.string().optional(),
  level: InterviewLevelDto,
  interviewerMode: InterviewerModeDto,
});

export const DashboardSummaryResponseDto = z.object({
  totals: z.object({
    sessions: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    averageScore: z.number().int().min(0).max(100).nullable(),
    freeSessionsUsed: z.number().int().nonnegative(),
    freeSessionsLimit: z.number().int().positive(),
  }),
  activeSession: InterviewHistoryItemDto.nullable(),
  recentSessions: z.array(InterviewHistoryItemDto),
  topFixes: z.array(z.string()),
  quickScenarios: z.array(DashboardQuickScenarioDto),
});

export type InterviewHistoryReport = z.infer<typeof InterviewHistoryReportDto>;
export type InterviewHistoryItem = z.infer<typeof InterviewHistoryItemDto>;
export type InterviewHistoryResponse = z.infer<
  typeof InterviewHistoryResponseDto
>;
export type DashboardQuickScenario = z.infer<typeof DashboardQuickScenarioDto>;
export type DashboardSummaryResponse = z.infer<
  typeof DashboardSummaryResponseDto
>;


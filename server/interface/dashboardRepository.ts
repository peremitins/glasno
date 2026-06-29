import type {
  InterviewLevel,
  InterviewerMode,
  InterviewSessionStatus,
} from '@/shared/dto';
import type { BillingOwner } from './billingRepository';
import type { ReportRecommendations, ReportStatus } from '@/shared/dto';

export interface DashboardSessionRecord {
  id: string;
  status: InterviewSessionStatus;
  vacancyTitle: string | null;
  companyName: string | null;
  role: string | null;
  level: InterviewLevel | null;
  interviewerMode: InterviewerMode;
  questionCount: number;
  answeredQuestions: number;
  createdAt: Date;
  report: {
    id: string;
    status: ReportStatus;
    overallScore: number | null;
    recommendations: ReportRecommendations | null;
  } | null;
}

export interface DashboardRepository {
  listOwnerSessions(
    owner: BillingOwner,
    options?: { limit?: number }
  ): Promise<DashboardSessionRecord[]>;
}


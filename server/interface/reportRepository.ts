import type {
  ReportAnalysis,
  ReportCriteria,
  ReportQuestionAnalysis,
  ReportRecommendations,
  ReportStatus,
} from '@/shared/dto';

export interface ReportRecord {
  id: string;
  sessionId: string;
  status: ReportStatus;
  overallScore: number | null;
  verdict: string | null;
  summary: string | null;
  criteria: ReportCriteria | null;
  recommendations: ReportRecommendations | null;
  questionAnalysis: ReportQuestionAnalysis[] | null;
  errorMessage: string | null;
  model: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportRepository {
  findById(id: string): Promise<ReportRecord | null>;
  findBySessionId(sessionId: string): Promise<ReportRecord | null>;
  createQueued(sessionId: string): Promise<ReportRecord>;
  markProcessing(id: string): Promise<ReportRecord>;
  saveCompleted(id: string, analysis: ReportAnalysis): Promise<ReportRecord>;
  saveFailed(id: string, message: string): Promise<ReportRecord>;
}

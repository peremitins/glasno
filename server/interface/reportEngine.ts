import type { ReportAnalysis } from '@/shared/dto';
import type {
  InterviewSessionRecord,
  InterviewTurnRecord,
} from './interviewRepository';

export interface AnalyzeReportParams {
  session: InterviewSessionRecord;
  turns: InterviewTurnRecord[];
}

export interface ReportEngine {
  analyze(params: AnalyzeReportParams): Promise<ReportAnalysis>;
}

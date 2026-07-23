import type { ReportAnalysis } from '@/shared/dto';
import type {
  InterviewSessionRecord,
  InterviewTurnRecord,
} from './interviewRepository';

export interface AnalyzeReportParams {
  session: InterviewSessionRecord;
  turns: InterviewTurnRecord[];
  // Непрерывное интервьюерское интервью: этапов нет, поэтому вопросно-ответные
  // пары выделяет модель из диалога, а не сервер по turnId.
  analysisMode?: 'per_turn' | 'interviewer_continuous';
  // План интервью — справочный контекст для отметки непокрытых тем.
  planQuestions?: string[];
}

export interface ReportEngine {
  analyze(params: AnalyzeReportParams): Promise<ReportAnalysis>;
}

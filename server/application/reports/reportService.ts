import type { InterviewReport } from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type {
  InterviewRepository,
  InterviewTurnRecord,
} from '@/server/interface/interviewRepository';
import type { ReportEngine } from '@/server/interface/reportEngine';
import type {
  ReportRecord,
  ReportRepository,
} from '@/server/interface/reportRepository';

export class ReportService {
  constructor(
    private readonly deps: {
      interviewRepository: Pick<
        InterviewRepository,
        'findSessionById' | 'listTurns'
      >;
      reportRepository: ReportRepository;
      engine: ReportEngine;
    }
  ) {}

  async ensureReport(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<InterviewReport> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    const existing = await this.deps.reportRepository.findBySessionId(session.id);
    if (existing?.status === 'done' || existing?.status === 'processing') {
      return toReportDto(existing);
    }

    if (session.status !== 'done') {
      throw apiError('E_CONFLICT', 'Сначала завершите интервью, затем сформируйте отчёт');
    }

    const report = existing ?? (await this.deps.reportRepository.createQueued(session.id));
    await this.deps.reportRepository.markProcessing(report.id);

    try {
      const turns = withDialogueAnswerFallback(
        await this.deps.interviewRepository.listTurns(session.id)
      );
      const answeredMainTurns = turns.filter(
        (turn) => turn.kind === 'main' && turn.answerTranscript
      );
      if (!answeredMainTurns.length) {
        throw apiError('E_CONFLICT', 'В интервью нет ответов для разбора');
      }

      const analysis = await this.deps.engine.analyze({ session, turns });
      const saved = await this.deps.reportRepository.saveCompleted(
        report.id,
        analysis
      );
      return toReportDto(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.deps.reportRepository.saveFailed(report.id, message);
      throw err;
    }
  }

  async getBySession(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<InterviewReport | null> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    const report = await this.deps.reportRepository.findBySessionId(session.id);
    return report ? toReportDto(report) : null;
  }

  async getById(params: {
    anonymousSessionId: string;
    userId?: string | null;
    reportId: string;
  }): Promise<InterviewReport> {
    const report = await this.deps.reportRepository.findById(params.reportId);
    if (!report) {
      throw apiError('E_NOT_FOUND', 'Отчёт не найден');
    }
    await this.requireOwnedSession(
      params.anonymousSessionId,
      report.sessionId,
      params.userId
    );
    return toReportDto(report);
  }

  private async requireOwnedSession(
    anonymousSessionId: string,
    sessionId: string,
    userId?: string | null
  ) {
    const session = await this.deps.interviewRepository.findSessionById(sessionId);
    if (!session) {
      throw apiError('E_NOT_FOUND', 'Интервью не найдено');
    }
    const ownedByAnonymousSession = session.anonymousSessionId === anonymousSessionId;
    const ownedByUser = Boolean(userId && session.userId === userId);
    if (!ownedByAnonymousSession && !ownedByUser) {
      throw apiError('E_FORBIDDEN', 'Нет доступа к этому интервью');
    }
    return session;
  }
}

function withDialogueAnswerFallback(
  turns: InterviewTurnRecord[]
): InterviewTurnRecord[] {
  return turns.map((turn) => {
    if (turn.answerTranscript || turn.kind !== 'main') return turn;
    const answer = extractUserDialogueAnswer(turn.metadata);
    return answer ? { ...turn, answerTranscript: answer } : turn;
  });
}

function extractUserDialogueAnswer(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const dialogue = (metadata as { dialogue?: unknown }).dialogue;
  if (!Array.isArray(dialogue)) return '';

  return dialogue
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const raw = item as { role?: unknown; content?: unknown };
      if (raw.role !== 'user') return '';
      return typeof raw.content === 'string' ? raw.content.trim() : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function toReportDto(report: ReportRecord): InterviewReport {
  return {
    id: report.id,
    sessionId: report.sessionId,
    status: report.status,
    overallScore: report.overallScore,
    verdict: report.verdict,
    summary: report.summary,
    criteria: report.criteria,
    recommendations: report.recommendations,
    questionAnalysis: report.questionAnalysis,
    errorMessage: report.errorMessage,
    model: report.model,
    createdAt: toIso(report.createdAt),
    updatedAt: toIso(report.updatedAt),
  };
}

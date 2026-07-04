import type {
  ExplainLearningTermRequest,
  ExplainLearningTermResponse,
  ExtractLearningTermsRequest,
  ExtractLearningTermsResponse,
  LearningTermContext,
} from '@/shared/dto';
import type { LearningTermsEngine } from '@/server/interface/learningTermsEngine';
import { apiError } from '@/server/utils/errors';

type LearningTermsSessionLookup = {
  findSessionById(id: string): Promise<{
    anonymousSessionId: string;
    userId: string | null;
  } | null>;
};

type LearningTermsReportLookup = {
  findById(id: string): Promise<{
    sessionId: string;
  } | null>;
};

export class LearningTermsService {
  constructor(
    private readonly deps: {
      interviewRepository: LearningTermsSessionLookup;
      reportRepository: LearningTermsReportLookup;
      engine: LearningTermsEngine;
    }
  ) {}

  async extractTerms(params: {
    anonymousSessionId: string;
    userId?: string | null;
    input: ExtractLearningTermsRequest;
  }): Promise<ExtractLearningTermsResponse> {
    await this.verifyContexts({
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
      contexts: params.input.items.map((item) => item.context),
    });

    return this.deps.engine.extractTerms(params.input, {
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
    });
  }

  async explainTerm(params: {
    anonymousSessionId: string;
    userId?: string | null;
    input: ExplainLearningTermRequest;
  }): Promise<ExplainLearningTermResponse> {
    await this.verifyContexts({
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
      contexts: [params.input.context],
    });

    return this.deps.engine.explainTerm(params.input, {
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
    });
  }

  private async verifyContexts(params: {
    anonymousSessionId: string;
    userId: string | null;
    contexts: LearningTermContext[];
  }) {
    const checkedSessions = new Set<string>();
    const checkedReports = new Set<string>();

    for (const context of params.contexts) {
      if (context.reportId && !checkedReports.has(context.reportId)) {
        checkedReports.add(context.reportId);
        const report = await this.deps.reportRepository.findById(context.reportId);
        if (!report) {
          throw apiError('E_NOT_FOUND', 'Отчёт не найден');
        }
        await this.requireOwnedSession({
          sessionId: report.sessionId,
          anonymousSessionId: params.anonymousSessionId,
          userId: params.userId,
        });
      }

      if (
        context.interviewSessionId &&
        !checkedSessions.has(context.interviewSessionId)
      ) {
        checkedSessions.add(context.interviewSessionId);
        await this.requireOwnedSession({
          sessionId: context.interviewSessionId,
          anonymousSessionId: params.anonymousSessionId,
          userId: params.userId,
        });
      }
    }
  }

  private async requireOwnedSession(params: {
    sessionId: string;
    anonymousSessionId: string;
    userId: string | null;
  }) {
    const session = await this.deps.interviewRepository.findSessionById(
      params.sessionId
    );
    if (!session) {
      throw apiError('E_NOT_FOUND', 'Интервью не найдено');
    }

    const ownedByAnonymousSession =
      session.anonymousSessionId === params.anonymousSessionId;
    const ownedByUser = Boolean(params.userId && session.userId === params.userId);
    if (!ownedByAnonymousSession && !ownedByUser) {
      throw apiError('E_FORBIDDEN', 'Нет доступа к этому интервью');
    }
  }
}

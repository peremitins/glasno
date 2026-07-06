import type {
  ExplainLearningTermRequest,
  ExplainLearningTermResponse,
  LearningTermContext,
} from '@/shared/dto';
import type { LearningTermsEngine } from '@/server/interface/learningTermsEngine';
import { assertOwnedInterviewSession } from '@/server/application/interview/sessionOwnership';
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

export type LearningTermsQuotaKind = 'explain';

// Квота считает только реальные LLM-вызовы: попадания в кэш бесплатны.
export interface LearningTermsQuota {
  consume(input: {
    kind: LearningTermsQuotaKind;
    amount: number;
    userId: string | null;
    anonymousSessionId: string;
  }): Promise<void>;
}

export interface LearningTermsCache {
  getExplanation(
    term: string,
    text: string
  ): Promise<ExplainLearningTermResponse | null>;
  setExplanation(
    term: string,
    text: string,
    value: ExplainLearningTermResponse
  ): Promise<void>;
}

// Для объяснения термина не нужен весь текст (до 2000 символов) — достаточно
// окна вокруг первого вхождения. Это режет входные токены в 2–3 раза и
// повышает попадания в кэш (один термин в длинных текстах → один ключ).
const EXPLAIN_CONTEXT_RADIUS = 300;

export function buildExplainContextWindow(text: string, term: string): string {
  const trimmed = text.trim();
  const needle = term.trim();
  if (!trimmed || trimmed.length <= EXPLAIN_CONTEXT_RADIUS * 2) return trimmed;

  const lowerText = trimmed.toLocaleLowerCase();
  // При смене регистра длина строки может измениться (например, «İ») —
  // тогда индексы не совпадают с оригиналом, ищем без сворачивания регистра.
  const haystack = lowerText.length === trimmed.length ? lowerText : trimmed;
  const index = haystack.indexOf(
    haystack === trimmed ? needle : needle.toLocaleLowerCase()
  );

  if (index < 0) {
    return `${trimmed.slice(0, EXPLAIN_CONTEXT_RADIUS * 2).trimEnd()}…`;
  }

  const start = Math.max(0, index - EXPLAIN_CONTEXT_RADIUS);
  const end = Math.min(
    trimmed.length,
    index + needle.length + EXPLAIN_CONTEXT_RADIUS
  );
  const prefix = start > 0 ? '…' : '';
  const suffix = end < trimmed.length ? '…' : '';
  return `${prefix}${trimmed.slice(start, end).trim()}${suffix}`;
}

export class LearningTermsService {
  constructor(
    private readonly deps: {
      interviewRepository: LearningTermsSessionLookup;
      reportRepository: LearningTermsReportLookup;
      engine: LearningTermsEngine;
      cache?: LearningTermsCache;
      quota?: LearningTermsQuota;
    }
  ) {}

  async explainTerm(params: {
    anonymousSessionId: string;
    userId?: string | null;
    input: ExplainLearningTermRequest;
  }): Promise<ExplainLearningTermResponse> {
    const userId = params.userId ?? null;
    await this.verifyContexts({
      anonymousSessionId: params.anonymousSessionId,
      userId,
      contexts: [params.input.context],
    });

    const windowedText = buildExplainContextWindow(
      params.input.text,
      params.input.term
    );

    const cached = await this.deps.cache?.getExplanation(
      params.input.term,
      windowedText
    );
    if (cached) return cached;

    await this.deps.quota?.consume({
      kind: 'explain',
      amount: 1,
      userId,
      anonymousSessionId: params.anonymousSessionId,
    });

    const response = await this.deps.engine.explainTerm(
      { ...params.input, text: windowedText || params.input.term },
      {
        anonymousSessionId: params.anonymousSessionId,
        userId,
      }
    );

    await this.deps.cache?.setExplanation(
      params.input.term,
      windowedText,
      response
    );
    return response;
  }

  private async verifyContexts(params: {
    anonymousSessionId: string;
    userId: string | null;
    contexts: LearningTermContext[];
  }) {
    const reportIds = new Set<string>();
    const sessionIds = new Set<string>();
    for (const context of params.contexts) {
      if (context.reportId) reportIds.add(context.reportId);
      if (context.interviewSessionId) sessionIds.add(context.interviewSessionId);
    }

    await Promise.all([
      ...[...reportIds].map(async (reportId) => {
        const report = await this.deps.reportRepository.findById(reportId);
        if (!report) {
          throw apiError('E_NOT_FOUND', 'Отчёт не найден');
        }
        await this.requireOwnedSession({
          sessionId: report.sessionId,
          anonymousSessionId: params.anonymousSessionId,
          userId: params.userId,
        });
      }),
      ...[...sessionIds].map((sessionId) =>
        this.requireOwnedSession({
          sessionId,
          anonymousSessionId: params.anonymousSessionId,
          userId: params.userId,
        })
      ),
    ]);
  }

  private async requireOwnedSession(params: {
    sessionId: string;
    anonymousSessionId: string;
    userId: string | null;
  }) {
    const session = await this.deps.interviewRepository.findSessionById(
      params.sessionId
    );
    assertOwnedInterviewSession(session, {
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId,
    });
  }
}

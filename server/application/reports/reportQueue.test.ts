import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportService } from './reportService';
import { enqueueOrRunReport } from './reportQueue';

const previousReportQueueAsync = process.env.REPORT_QUEUE_ASYNC;

afterEach(() => {
  process.env.REPORT_QUEUE_ASYNC = previousReportQueueAsync;
  vi.restoreAllMocks();
});

describe('report queue', () => {
  it('starts in-process report generation instead of waiting for synchronous analysis when Redis queue is disabled', async () => {
    process.env.REPORT_QUEUE_ASYNC = 'false';
    const report = {
      id: 'report_1',
      sessionId: 'session_1',
      status: 'processing',
      overallScore: null,
      verdict: null,
      summary: null,
      criteria: null,
      recommendations: null,
      questionAnalysis: null,
      errorMessage: null,
      model: null,
      createdAt: '2026-06-28T10:10:00.000Z',
      updatedAt: '2026-06-28T10:10:00.000Z',
    };
    const service = {
      startReportGeneration: vi.fn().mockResolvedValue(report),
      ensureReport: vi.fn(),
    } as unknown as ReportService;

    const result = await enqueueOrRunReport({
      service,
      redisUrl: null,
      anonymousSessionId: 'anon_1',
      userId: null,
      sessionId: 'session_1',
    });

    expect(result).toBe(report);
    expect(service.startReportGeneration).toHaveBeenCalledWith({
      anonymousSessionId: 'anon_1',
      userId: null,
      sessionId: 'session_1',
    });
    expect(service.ensureReport).not.toHaveBeenCalled();
  });
});

import { Queue, Worker, type Job } from 'bullmq';
import type { ReportService } from './reportService';

const QUEUE_NAME = 'jobai:reports';

export interface ReportGenerationJob {
  anonymousSessionId: string;
  userId?: string | null;
  sessionId: string;
}

let queue: Queue | null = null;

function resolveRedisUrl(redisUrl?: string | null): string {
  return redisUrl || process.env.NUXT_REDIS_URL || process.env.REDIS_URL || '';
}

function getQueue(redisUrl?: string | null) {
  const url = resolveRedisUrl(redisUrl);
  if (!url) return null;

  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: {
        url,
        maxRetriesPerRequest: null,
      },
    });
  }
  return queue;
}

export async function enqueueOrRunReport(params: {
  service: ReportService;
  redisUrl?: string | null;
  anonymousSessionId: string;
  userId?: string | null;
  sessionId: string;
}) {
  const asyncQueueEnabled = process.env.REPORT_QUEUE_ASYNC === 'true';
  const queueInstance = asyncQueueEnabled ? getQueue(params.redisUrl) : null;

  if (queueInstance) {
    await queueInstance.add(
      'generate',
      {
        anonymousSessionId: params.anonymousSessionId,
        userId: params.userId ?? null,
        sessionId: params.sessionId,
      },
      {
        attempts: 2,
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    );
    return params.service.getBySession({
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId,
      sessionId: params.sessionId,
    });
  }

  return params.service.ensureReport({
    anonymousSessionId: params.anonymousSessionId,
    userId: params.userId,
    sessionId: params.sessionId,
  });
}

export function createReportWorker(params: {
  redisUrl: string;
  createService: () => ReportService;
}) {
  return new Worker<ReportGenerationJob>(
    QUEUE_NAME,
    async (job: Job<ReportGenerationJob>) => {
      const service = params.createService();
      await service.ensureReport(job.data);
    },
    {
      connection: {
        url: params.redisUrl,
        maxRetriesPerRequest: null,
      },
    }
  );
}

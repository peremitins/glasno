import { Queue, Worker } from 'bullmq';
import type { BillingService } from './billingService';

const QUEUE_PREFIX = 'glasno';
const QUEUE_NAME = 'billing-renewal';
const SWEEP_JOB_NAME = 'renewal-sweep';

// Раз в час: чаще не нужно (nextChargeAt с точностью до дня), реже — рискуем
// сдвинуть списание к ночи, когда карты чаще отклоняются банками.
export const RENEWAL_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

let queue: Queue | null = null;

export function resolveRenewalRedisUrl(
  redisUrl?: string | null
): string {
  return redisUrl || process.env.NUXT_REDIS_URL || process.env.REDIS_URL || '';
}

function getQueue(redisUrl: string) {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      prefix: QUEUE_PREFIX,
      connection: {
        url: redisUrl,
        maxRetriesPerRequest: null,
      },
    });
  }
  return queue;
}

// Идемпотентно регистрирует периодический джоб (Job Scheduler BullMQ):
// повторный вызов при рестарте или со второй реплики просто обновляет
// расписание, дубликатов не создаёт.
export async function ensureRenewalSchedule(redisUrl: string): Promise<void> {
  const queueInstance = getQueue(redisUrl);
  await queueInstance.upsertJobScheduler(
    SWEEP_JOB_NAME,
    { every: RENEWAL_SWEEP_INTERVAL_MS },
    {
      name: SWEEP_JOB_NAME,
      opts: { removeOnComplete: 20, removeOnFail: 20 },
    }
  );
}

export function createRenewalWorker(params: {
  redisUrl: string;
  createService: () => BillingService;
}) {
  return new Worker(
    QUEUE_NAME,
    async () => {
      const service = params.createService();
      await service.runAutoRenewalSweep();
    },
    {
      prefix: QUEUE_PREFIX,
      connection: {
        url: params.redisUrl,
        maxRetriesPerRequest: null,
      },
      // Один обход за раз: claim-паттерн и так защищает от двойных списаний,
      // но параллельные обходы бессмысленны.
      concurrency: 1,
    }
  );
}

export async function closeRenewalQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

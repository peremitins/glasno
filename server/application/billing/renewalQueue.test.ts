import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeRenewalQueue,
  createRenewalWorker,
  ensureRenewalSchedule,
  RENEWAL_SWEEP_INTERVAL_MS,
  resolveRenewalRedisUrl,
} from './renewalQueue';

const previousNuxtRedisUrl = process.env.NUXT_REDIS_URL;
const previousRedisUrl = process.env.REDIS_URL;

const bullmq = vi.hoisted(() => ({
  queueClose: vi.fn().mockResolvedValue(undefined),
  queueOn: vi.fn(),
  upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  workerClose: vi.fn().mockResolvedValue(undefined),
  workerOn: vi.fn(),
  workerProcessor: null as null | (() => Promise<void>),
  Queue: vi.fn(function QueueMock() {
    return {
      close: bullmq.queueClose,
      upsertJobScheduler: bullmq.upsertJobScheduler,
      on: bullmq.queueOn,
    };
  }),
  Worker: vi.fn(function WorkerMock(
    _queueName: string,
    processor: () => Promise<void>,
    _options: unknown
  ) {
    bullmq.workerProcessor = processor;
    return {
      close: bullmq.workerClose,
      on: bullmq.workerOn,
    };
  }),
}));

vi.mock('bullmq', () => ({
  Queue: bullmq.Queue,
  Worker: bullmq.Worker,
}));

describe('renewalQueue', () => {
  afterEach(async () => {
    await closeRenewalQueue();
    vi.clearAllMocks();
    bullmq.workerProcessor = null;
    restoreEnv('NUXT_REDIS_URL', previousNuxtRedisUrl);
    restoreEnv('REDIS_URL', previousRedisUrl);
  });

  it('resolves Redis from runtime config before environment fallbacks', () => {
    process.env.NUXT_REDIS_URL = 'redis://nuxt-env:6379/1';
    process.env.REDIS_URL = 'redis://generic-env:6379/2';

    expect(resolveRenewalRedisUrl('redis://runtime:6379/0')).toBe(
      'redis://runtime:6379/0'
    );
    expect(resolveRenewalRedisUrl()).toBe('redis://nuxt-env:6379/1');
    delete process.env.NUXT_REDIS_URL;
    expect(resolveRenewalRedisUrl()).toBe('redis://generic-env:6379/2');
  });

  it('uses BullMQ prefix instead of colon in the queue name', async () => {
    await ensureRenewalSchedule('redis://localhost:6379/1');

    expect(bullmq.Queue).toHaveBeenCalledWith('billing-renewal', {
      prefix: 'glasno',
      connection: {
        url: 'redis://localhost:6379/1',
        maxRetriesPerRequest: null,
      },
    });
    expect(bullmq.upsertJobScheduler).toHaveBeenCalledWith(
      'renewal-sweep',
      { every: RENEWAL_SWEEP_INTERVAL_MS },
      {
        name: 'renewal-sweep',
        opts: { removeOnComplete: 20, removeOnFail: 20 },
      }
    );
  });

  it('creates the renewal worker with a valid BullMQ queue name', () => {
    const createService = vi.fn();

    createRenewalWorker({
      redisUrl: 'redis://localhost:6379/1',
      createService,
    });

    expect(bullmq.Worker).toHaveBeenCalledWith(
      'billing-renewal',
      expect.any(Function),
      {
        prefix: 'glasno',
        connection: {
          url: 'redis://localhost:6379/1',
          maxRetriesPerRequest: null,
        },
        concurrency: 1,
      }
    );
  });

  it('runs the renewal notice and charge sweeps from the worker processor', async () => {
    const runAutoRenewalSweep = vi.fn().mockResolvedValue({
      processed: 2,
      failed: 0,
    });
    const runRenewalNoticeSweep = vi.fn().mockResolvedValue({
      sent: 1,
      skipped: 0,
    });
    const createService = vi
      .fn()
      .mockReturnValue({ runAutoRenewalSweep, runRenewalNoticeSweep });

    createRenewalWorker({
      redisUrl: 'redis://localhost:6379/1',
      createService,
    });
    await expect(bullmq.workerProcessor?.()).resolves.toBeUndefined();
    expect(createService).toHaveBeenCalledOnce();
    // Предуведомление идёт до списания: письмо не должно проигрывать
    // гонку самому чарджу.
    expect(runRenewalNoticeSweep.mock.invocationCallOrder[0]).toBeLessThan(
      runAutoRenewalSweep.mock.invocationCallOrder[0]!
    );
    expect(runAutoRenewalSweep).toHaveBeenCalledOnce();
  });

  it('closes and releases the cached queue', async () => {
    await ensureRenewalSchedule('redis://localhost:6379/1');

    await closeRenewalQueue();
    await ensureRenewalSchedule('redis://localhost:6379/1');

    expect(bullmq.queueClose).toHaveBeenCalledOnce();
    expect(bullmq.Queue).toHaveBeenCalledTimes(2);
  });
});

function restoreEnv(name: 'NUXT_REDIS_URL' | 'REDIS_URL', value?: string) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }
  process.env[name] = value;
}

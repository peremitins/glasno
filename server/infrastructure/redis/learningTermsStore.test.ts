import { afterEach, describe, expect, it } from 'vitest';
import {
  createLearningTermsCache,
  createLearningTermsQuota,
} from './learningTermsStore';

const ENV_KEYS = [
  'NUXT_LEARNING_TERMS_EXPLAIN_DAILY_LIMIT_ANON',
  'NUXT_LEARNING_TERMS_EXPLAIN_DAILY_LIMIT_USER',
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    Reflect.deleteProperty(process.env, key);
  }
});

describe('learning terms cache (in-memory fallback)', () => {
  it('round-trips explanations and validates stored shape', async () => {
    const cache = createLearningTermsCache({ redis: null, model: 'test-model' });
    const explanation = {
      term: 'CORS',
      title: 'CORS',
      shortDefinition: 'CORS — правила доступа между доменами.',
      explanation: 'CORS ограничивает чтение ответов между доменами.',
    };

    await cache.setExplanation('CORS', 'Что такое CORS?', explanation);
    await expect(
      cache.getExplanation('CORS', 'Что такое CORS?')
    ).resolves.toEqual(explanation);
    await expect(
      cache.getExplanation('CORS', 'другой текст')
    ).resolves.toBeNull();
  });
});

describe('learning terms quota (in-memory fallback)', () => {
  it('allows consumption within the daily limit and rejects beyond it', async () => {
    process.env.NUXT_LEARNING_TERMS_EXPLAIN_DAILY_LIMIT_ANON = '2';
    const quota = createLearningTermsQuota({ redis: null });
    // Module-level fallback-счётчики общие для процесса — каждому тесту
    // свой subject, чтобы лимиты не пересекались.
    const input = {
      kind: 'explain' as const,
      amount: 1,
      userId: null,
      anonymousSessionId: 'anon_limit_test',
    };

    await expect(quota.consume(input)).resolves.toBeUndefined();
    await expect(quota.consume(input)).resolves.toBeUndefined();
    await expect(quota.consume(input)).rejects.toMatchObject({
      data: { code: 'E_RATE' },
    });
  });

  it('tracks anonymous sessions and users independently', async () => {
    process.env.NUXT_LEARNING_TERMS_EXPLAIN_DAILY_LIMIT_ANON = '1';
    process.env.NUXT_LEARNING_TERMS_EXPLAIN_DAILY_LIMIT_USER = '2';
    const quota = createLearningTermsQuota({ redis: null });

    await expect(
      quota.consume({
        kind: 'explain',
        amount: 1,
        userId: null,
        anonymousSessionId: 'anon_iso_test',
      })
    ).resolves.toBeUndefined();
    // Авторизованный пользователь с тем же anonymousSessionId — отдельный
    // subject с собственным (более высоким) лимитом.
    await expect(
      quota.consume({
        kind: 'explain',
        amount: 2,
        userId: 'user_iso_test',
        anonymousSessionId: 'anon_iso_test',
      })
    ).resolves.toBeUndefined();
    await expect(
      quota.consume({
        kind: 'explain',
        amount: 1,
        userId: null,
        anonymousSessionId: 'anon_iso_test',
      })
    ).rejects.toMatchObject({ data: { code: 'E_RATE' } });
  });
});

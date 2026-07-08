import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  ExplainLearningTermResponseDto,
  type ExplainLearningTermResponse,
} from '@/shared/dto';
import type {
  LearningTermsCache,
  LearningTermsQuota,
  LearningTermsQuotaKind,
} from '@/server/application/learningTerms/learningTermsService';
import { apiError } from '@/server/utils/errors';

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const QUOTA_TTL_SECONDS = 25 * 60 * 60;
const MEMORY_CACHE_MAX_ENTRIES = 500;

function textHash(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

function utcDayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// --- Кэш результатов explain ---------------------------------------------

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

function createMemoryKv() {
  const entries = new Map<string, MemoryCacheEntry>();

  return {
    get(key: string): string | null {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key: string, value: string, ttlSeconds: number) {
      if (entries.size >= MEMORY_CACHE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
  };
}

// Фабрики вызываются на каждый запрос, поэтому in-memory fallback должен
// жить на уровне модуля — иначе без Redis кэш и квоты обнуляются каждым
// HTTP-запросом и не работают вовсе.
const sharedMemoryKv = createMemoryKv();
const sharedMemoryCounters = new Map<
  string,
  { count: number; expiresAt: number }
>();

export function createLearningTermsCache(params: {
  redis: Redis | null;
  model: string;
}): LearningTermsCache {
  const { redis, model } = params;
  const memory = sharedMemoryKv;
  const prefix = `glasno:lt:v1:${model}`;

  async function readRaw(key: string): Promise<string | null> {
    if (redis) {
      try {
        return await redis.get(key);
      } catch {
        // Redis недоступен — работаем как при промахе кэша.
        return memory.get(key);
      }
    }
    return memory.get(key);
  }

  async function writeRaw(key: string, value: string) {
    memory.set(key, value, CACHE_TTL_SECONDS);
    if (redis) {
      try {
        await redis.set(key, value, 'EX', CACHE_TTL_SECONDS);
      } catch {
        // Кэш необязателен: недоступный Redis не должен ломать запрос.
      }
    }
  }

  return {
    async getExplanation(
      term: string,
      text: string
    ): Promise<ExplainLearningTermResponse | null> {
      const raw = await readRaw(
        `${prefix}:explain:${textHash(term)}:${textHash(text)}`
      );
      if (!raw) return null;
      try {
        const parsed = ExplainLearningTermResponseDto.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    async setExplanation(
      term: string,
      text: string,
      value: ExplainLearningTermResponse
    ) {
      await writeRaw(
        `${prefix}:explain:${textHash(term)}:${textHash(text)}`,
        JSON.stringify(value)
      );
    },
  };
}

// --- Дневные квоты ---------------------------------------------------------
// Квота считает только реальные LLM-вызовы (промахи кэша). Анонимы получают
// жёсткий лимит: эндпоинты доступны без оплаты, и без квоты это готовый
// LLM-прокси (~180 req/min на IP пропускает глобальный rate-limit).

interface QuotaLimits {
  explain: number;
}

function readLimit(envName: string, fallback: number): number {
  const raw = Number(process.env[envName]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function resolveLimits(isAuthenticated: boolean): QuotaLimits {
  if (isAuthenticated) {
    return {
      explain: readLimit('NUXT_LEARNING_TERMS_EXPLAIN_DAILY_LIMIT_USER', 200),
    };
  }
  return {
    explain: readLimit('NUXT_LEARNING_TERMS_EXPLAIN_DAILY_LIMIT_ANON', 30),
  };
}

export function createLearningTermsQuota(params: {
  redis: Redis | null;
}): LearningTermsQuota {
  const { redis } = params;
  const memoryCounters = sharedMemoryCounters;

  async function increment(key: string, amount: number): Promise<number> {
    if (redis) {
      try {
        const value = await redis.incrby(key, amount);
        if (value === amount) {
          await redis.expire(key, QUOTA_TTL_SECONDS);
        }
        return value;
      } catch {
        // Redis недоступен — падаем на локальный счётчик, чтобы квота
        // продолжала защищать хотя бы в рамках инстанса.
      }
    }

    const now = Date.now();
    const entry = memoryCounters.get(key);
    if (!entry || entry.expiresAt < now) {
      memoryCounters.set(key, {
        count: amount,
        expiresAt: now + QUOTA_TTL_SECONDS * 1000,
      });
      return amount;
    }
    entry.count += amount;
    return entry.count;
  }

  return {
    async consume(input: {
      kind: LearningTermsQuotaKind;
      amount: number;
      userId: string | null;
      anonymousSessionId: string;
    }) {
      if (input.amount <= 0) return;

      const subject = input.userId
        ? `user:${input.userId}`
        : `anon:${input.anonymousSessionId}`;
      const limits = resolveLimits(Boolean(input.userId));
      const limit = limits[input.kind];
      const key = `glasno:lt:quota:${input.kind}:${subject}:${utcDayStamp()}`;

      const used = await increment(key, input.amount);
      if (used > limit) {
        throw apiError(
          'E_RATE',
          'Дневной лимит подсказок исчерпан, попробуйте завтра',
          { kind: input.kind, limit }
        );
      }
    },
  };
}

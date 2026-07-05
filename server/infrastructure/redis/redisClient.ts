import { Redis } from 'ioredis';

// Один общий ioredis-клиент на процесс (BullMQ держит свои соединения сам).
// Возвращает null, если Redis не сконфигурирован — вызывающий код обязан
// уметь работать без него (in-memory fallback или отключение функции).
let client: Redis | null = null;
let failedUrl: string | null = null;

function resolveRedisUrl(redisUrl?: string | null): string {
  return redisUrl || process.env.NUXT_REDIS_URL || process.env.REDIS_URL || '';
}

export function getRedisClient(redisUrl?: string | null): Redis | null {
  const url = resolveRedisUrl(redisUrl);
  if (!url || url === failedUrl) return null;

  if (!client) {
    try {
      client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: false,
      });
      // Кэш и счётчики не критичны: ошибки соединения не должны падать
      // unhandled rejection'ом и ломать запросы.
      client.on('error', () => {});
    } catch {
      failedUrl = url;
      return null;
    }
  }
  return client;
}

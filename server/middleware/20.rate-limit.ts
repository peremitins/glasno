import { apiError } from '../utils/errors';

// Простой in-memory rate-limit по IP (только для /api).
// На проде/нескольких инстансах заменим на Redis-лимитер (Фаза 9).
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export default defineEventHandler((event) => {
  if (!event.path?.startsWith('/api')) return;

  const max = Number(process.env.RATE_LIMIT_MAX || 180);
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);

  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    setResponseHeader(event, 'Retry-After', retryAfter);
    throw apiError('E_RATE', 'Слишком много запросов, попробуйте позже');
  }
});

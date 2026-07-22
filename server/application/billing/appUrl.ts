export const PRODUCTION_APP_URL = 'https://my.glasno.app';
const DEVELOPMENT_APP_URL = 'http://localhost:3000';

/**
 * Публичная база для ссылок в письмах и return_url платёжного провайдера.
 * В production локальный/невалидный fallback опасен: письмо уже невозможно
 * исправить после отправки, поэтому fail-safe ведёт на боевое приложение.
 */
export function resolveBillingAppUrl(
  configuredValue: unknown,
  nodeEnv = process.env.NODE_ENV
): string {
  const fallback =
    nodeEnv === 'production' ? PRODUCTION_APP_URL : DEVELOPMENT_APP_URL;
  if (typeof configuredValue !== 'string' || !configuredValue.trim()) {
    return fallback;
  }

  try {
    const url = new URL(configuredValue.trim());
    const localHostname =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1' ||
      url.hostname.endsWith('.localhost');
    if (
      nodeEnv === 'production' &&
      (localHostname || url.protocol !== 'https:')
    ) {
      return PRODUCTION_APP_URL;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return fallback;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

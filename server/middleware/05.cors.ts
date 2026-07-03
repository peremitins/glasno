// CORS для кросс-доменных запросов лендинга (glasno.app) к API приложения
// (my.glasno.app). Same-origin запросы самого приложения CORS не требуют.
// В production список origins задаётся через ALLOWED_ORIGINS (через запятую),
// в dev всегда разрешены локальные адреса приложения (:3000) и лендинга (:3001).
const isProd = process.env.NODE_ENV === 'production';

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function parseOrigins(envValue?: string): string[] {
  return (envValue || '')
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
}

function getAllowedOrigins(): string[] {
  if (isProd) {
    const fromEnv = parseOrigins(process.env.ALLOWED_ORIGINS);
    if (!fromEnv.length) {
      throw new Error('ALLOWED_ORIGINS must be set in production');
    }
    return fromEnv;
  }

  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    ...parseOrigins(process.env.DEV_ALLOWED_ORIGINS),
  ];
}

const allowedOrigins = new Set(getAllowedOrigins());

const ALLOW_HEADERS =
  'Content-Type, Accept, X-Requested-With, X-CSRF-Token, X-Request-Id';

export default defineEventHandler((event) => {
  const origin = getRequestHeader(event, 'origin');
  const isPreflight = event.method === 'OPTIONS';

  if (!origin || !allowedOrigins.has(normalizeOrigin(origin))) {
    if (isPreflight) {
      setResponseStatus(event, 204);
      return '';
    }
    return;
  }

  setResponseHeader(event, 'Vary', 'Origin');
  setResponseHeader(event, 'Access-Control-Allow-Origin', origin);
  setResponseHeader(event, 'Access-Control-Allow-Credentials', 'true');
  setResponseHeader(
    event,
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,DELETE,OPTIONS,PATCH'
  );
  setResponseHeader(event, 'Access-Control-Allow-Headers', ALLOW_HEADERS);
  setResponseHeader(event, 'Access-Control-Max-Age', 86400);

  if (isPreflight) {
    setResponseStatus(event, 204);
    return '';
  }
});

import { createAuthSessionService } from '../application/auth/serviceFactory';
import { CSRF_COOKIE_NAME } from '../application/auth/authSessionService';
import { apiError } from '../utils/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/email/start',
  '/api/auth/email/verify',
  '/api/auth/telegram/login',
  '/api/auth/magic/consume',
]);

export default defineEventHandler((event) => {
  if (!event.path?.startsWith('/api')) return;
  if (SAFE_METHODS.has(event.method)) return;
  if (CSRF_EXEMPT_PATHS.has(event.path)) return;
  if (!event.context.auth) return;

  const csrfCookie = getCookie(event, CSRF_COOKIE_NAME);
  const csrfHeader = getHeader(event, 'x-csrf-token');
  const ok = createAuthSessionService(event).validateCsrf({
    session: event.context.auth.session,
    cookieToken: csrfCookie,
    headerToken: csrfHeader,
  });

  if (!ok) {
    const err = apiError('E_FORBIDDEN', 'CSRF-токен не прошёл проверку');
    setResponseStatus(event, err.statusCode);
    return { error: err.data };
  }
});

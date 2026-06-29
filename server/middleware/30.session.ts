import { createAuthSessionService } from '../application/auth/serviceFactory';
import { AUTH_COOKIE_NAME } from '../application/auth/authSessionService';
import { getOrCreateAnonSession } from '../utils/session';

// Кладёт anonymous session в контекст для всех /api-запросов.
// Если есть валидная auth-cookie, дополнительно кладёт event.context.auth.
export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/api')) return;
  const anonymousSession = getOrCreateAnonSession(event);
  event.context.session = anonymousSession;

  const authCookie = getCookie(event, AUTH_COOKIE_NAME);
  if (!authCookie) return;

  const auth = await createAuthSessionService(event).resolveFromCookie(authCookie);
  if (!auth) {
    deleteCookie(event, AUTH_COOKIE_NAME, { path: '/' });
    return;
  }

  event.context.auth = auth;
  event.context.session = {
    ...anonymousSession,
    isAnonymous: false,
    userId: auth.user.id,
    role: auth.user.role,
    authSessionId: auth.session.id,
  };
});

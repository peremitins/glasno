import type { H3Event } from 'h3';
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_TTL_SECONDS,
  CSRF_COOKIE_NAME,
} from './authSessionService';

export function setAuthCookies(
  event: H3Event,
  params: { cookieValue: string; csrfToken: string }
) {
  const secure = process.env.NODE_ENV === 'production';

  setCookie(event, AUTH_COOKIE_NAME, params.cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_SESSION_TTL_SECONDS,
    secure,
  });
  setCookie(event, CSRF_COOKIE_NAME, params.csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_SESSION_TTL_SECONDS,
    secure,
  });
}

export function clearAuthCookies(event: H3Event) {
  deleteCookie(event, AUTH_COOKIE_NAME, { path: '/' });
  deleteCookie(event, CSRF_COOKIE_NAME, { path: '/' });
}

import { CSRF_COOKIE_NAME } from '@/shared/constants';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readClientCookie(name: string): string | null {
  if (!import.meta.client) return null;
  const prefix = `${name}=`;
  const raw = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return raw ? decodeURIComponent(raw.slice(prefix.length)) : null;
}

// Единая точка HTTP-запросов с фронта. Не используем голый $fetch напрямую.
// credentials: 'include' — чтобы передавались anonymous/auth cookies.
export function useAPI() {
  return $fetch.create({
    credentials: 'include',
    headers: { Accept: 'application/json' },
    onRequest({ options }) {
      const method = String(options.method || 'GET').toUpperCase();
      const csrfToken = UNSAFE_METHODS.has(method)
        ? readClientCookie(CSRF_COOKIE_NAME)
        : null;
      if (!csrfToken) return;

      const headers = new Headers(options.headers as HeadersInit);
      headers.set('x-csrf-token', csrfToken);
      options.headers = headers;
    },
  });
}

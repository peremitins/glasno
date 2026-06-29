import { useAuthStore } from '@/app/stores/auth';

// Публичные маршруты, не требующие авторизации.
const PUBLIC_ROUTES = ['/auth', '/auth/link'];

function isPublic(path: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`)
  );
}

// Безопасный внутренний путь для redirect после входа (без open-redirect).
function isSafeInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

// Глобальная защита роутинга. Приложение — SPA (ssr:false), проверяем на клиенте.
// Неавторизованного редиректим на /auth?next=..., авторизованного уводим с /auth.
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;

  const auth = useAuthStore();

  // Узнаём состояние авторизации один раз (если ещё не знаем).
  if (!auth.user) {
    try {
      await auth.fetchMe();
    } catch {
      // не авторизован — ок
    }
  }

  if (auth.isAuthenticated) {
    if (to.path === '/auth') {
      const next =
        typeof to.query.next === 'string' && isSafeInternalPath(to.query.next)
          ? to.query.next
          : '/';
      return navigateTo(next);
    }
    return;
  }

  if (isPublic(to.path)) return;

  const next = isSafeInternalPath(to.fullPath) ? to.fullPath : '/';
  return navigateTo(`/auth?next=${encodeURIComponent(next)}`);
});

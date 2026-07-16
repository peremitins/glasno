import { useAuthStore } from '@/app/stores/auth';

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return;

  const auth = useAuthStore();
  if (!auth.user) {
    try {
      await auth.fetchMe();
    } catch {
      return navigateTo('/auth');
    }
  }

  if (auth.user?.role !== 'admin') {
    return navigateTo('/');
  }
});

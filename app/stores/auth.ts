import { defineStore } from 'pinia';
import { ref } from 'vue';

// Минимальный скелет стора авторизации.
// Реальная логика (passwordless через Telegram magic-link, сессия) — позже.
export const useAuthStore = defineStore('auth', () => {
  const userId = ref<string | null>(null);
  const isAuthenticated = ref(false);

  function setUser(id: string) {
    userId.value = id;
    isAuthenticated.value = true;
  }

  function reset() {
    userId.value = null;
    isAuthenticated.value = false;
  }

  return { userId, isAuthenticated, setUser, reset };
});

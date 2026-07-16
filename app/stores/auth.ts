import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AuthLoginResponse,
  AuthMeResponse,
  AuthProfileResponse,
  AuthUser,
  DeleteAccountResponse,
  EmailLoginStartResponse,
} from '@/shared/dto';
import { YandexMetrikaGoal } from '@/shared/analytics/yandexMetrika';
import { reachYandexMetrikaGoal } from '@/app/utils/yandexMetrika';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const isLoading = ref(false);
  const isSubmitting = ref(false);
  const errorMessage = ref('');

  const userId = computed(() => user.value?.id ?? null);
  const isAuthenticated = computed(() => Boolean(user.value));

  function setUser(nextUser: AuthUser | null) {
    user.value = nextUser;
  }

  function reset() {
    user.value = null;
    errorMessage.value = '';
  }

  async function fetchMe() {
    isLoading.value = true;
    errorMessage.value = '';
    try {
      const response = await useAPI()<AuthMeResponse>('/api/auth/me');
      user.value = response.user;
      return response;
    } catch (err) {
      reset();
      errorMessage.value = extractApiError(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function startEmailLogin(email: string): Promise<EmailLoginStartResponse> {
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      return await useAPI()<EmailLoginStartResponse>('/api/auth/email/start', {
        method: 'POST',
        body: { email },
      });
    } catch (err) {
      errorMessage.value = extractApiError(err);
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function startEmailRegistration(
    email: string
  ): Promise<EmailLoginStartResponse> {
    // Passwordless-flow общий: verify-код либо найдёт существующего пользователя,
    // либо создаст нового и перенесёт anonymous-сессии в профиль.
    return startEmailLogin(email);
  }

  async function verifyEmailLogin(
    email: string,
    code: string,
    displayName?: string
  ) {
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      const response = await useAPI()<AuthLoginResponse>(
        '/api/auth/email/verify',
        {
          method: 'POST',
          body: { email, code, displayName },
        }
      );
      user.value = response.user;
      reachYandexMetrikaGoal(YandexMetrikaGoal.authCompleted);
      return response;
    } catch (err) {
      errorMessage.value = extractApiError(err);
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function logout() {
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      await useAPI()('/api/auth/logout', { method: 'POST' });
      reset();
    } catch (err) {
      errorMessage.value = extractApiError(err);
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function updateProfile(displayName: string | null) {
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      const response = await useAPI()<AuthProfileResponse>('/api/auth/profile', {
        method: 'PATCH',
        body: { displayName },
      });
      user.value = response.user;
      return response;
    } catch (err) {
      errorMessage.value = extractApiError(err);
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function uploadAvatar(file: File) {
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await useAPI()<AuthProfileResponse>(
        '/api/auth/profile/avatar',
        { method: 'POST', body }
      );
      user.value = response.user;
      return response;
    } catch (err) {
      errorMessage.value = extractApiError(err);
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function deleteAvatar() {
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      const response = await useAPI()<AuthProfileResponse>(
        '/api/auth/profile/avatar',
        { method: 'DELETE' }
      );
      user.value = response.user;
      return response;
    } catch (err) {
      errorMessage.value = extractApiError(err);
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function deleteAccount() {
    isSubmitting.value = true;
    errorMessage.value = '';
    try {
      const response = await useAPI()<DeleteAccountResponse>(
        '/api/auth/account',
        { method: 'DELETE' }
      );
      reset();
      return response;
    } catch (err) {
      errorMessage.value = extractApiError(err);
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  return {
    user,
    userId,
    isAuthenticated,
    isLoading,
    isSubmitting,
    errorMessage,
    setUser,
    reset,
    fetchMe,
    startEmailLogin,
    startEmailRegistration,
    verifyEmailLogin,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    logout,
    deleteAccount,
  };
});

function extractApiError(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: { message?: string } } }).data;
    return data?.error?.message || 'Не удалось выполнить действие';
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить действие';
}

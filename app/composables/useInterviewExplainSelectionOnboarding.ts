import { computed, onBeforeUnmount, ref } from 'vue';
import { useAuthStore } from '@/app/stores/auth';
import type { OnboardingCompleteResponse } from '@/shared/dto';

const OPEN_DELAY_MS = 520;

export function useInterviewExplainSelectionOnboarding() {
  const auth = useAuthStore();
  const api = useAPI();

  const show = ref(false);
  const pending = ref(false);
  const errorMessage = ref('');
  let hasScheduledOrShown = false;
  let openTimer: number | null = null;

  const canShow = computed(() => {
    return Boolean(
      auth.user && !auth.user.onboarding.interviewExplainSelection
    );
  });

  function clearScheduledOpen() {
    if (openTimer === null) return;
    window.clearTimeout(openTimer);
    openTimer = null;
  }

  function scheduleInterviewExplainSelectionOnboarding(ready: boolean) {
    if (!import.meta.client) return;
    if (!ready || !canShow.value) {
      clearScheduledOpen();
      return;
    }
    if (hasScheduledOrShown) {
      return;
    }

    hasScheduledOrShown = true;
    clearScheduledOpen();
    openTimer = window.setTimeout(() => {
      openTimer = null;
      if (canShow.value) {
        show.value = true;
      }
    }, OPEN_DELAY_MS);
  }

  function closeInterviewExplainSelectionOnboarding() {
    clearScheduledOpen();
    show.value = false;
    errorMessage.value = '';
  }

  async function completeInterviewExplainSelectionOnboarding() {
    if (pending.value) return;

    pending.value = true;
    errorMessage.value = '';
    try {
      const response = await api<OnboardingCompleteResponse>(
        '/api/user/onboarding/interview-explain-selection/complete',
        { method: 'POST' }
      );

      if (auth.user) {
        auth.setUser({
          ...auth.user,
          onboarding: {
            ...auth.user.onboarding,
            interviewExplainSelection:
              response.onboarding.interviewExplainSelection,
          },
        });
      }

      show.value = false;
    } catch {
      errorMessage.value =
        'Не удалось сохранить отметку. Проверьте соединение и попробуйте ещё раз.';
    } finally {
      pending.value = false;
    }
  }

  onBeforeUnmount(() => {
    clearScheduledOpen();
  });

  return {
    showInterviewExplainSelectionOnboarding: show,
    canShowInterviewExplainSelectionOnboarding: canShow,
    interviewExplainSelectionOnboardingPending: pending,
    interviewExplainSelectionOnboardingError: errorMessage,
    scheduleInterviewExplainSelectionOnboarding,
    closeInterviewExplainSelectionOnboarding,
    completeInterviewExplainSelectionOnboarding,
  };
}

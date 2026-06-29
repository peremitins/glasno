import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type {
  RealtimeSessionEndReason,
  RealtimeSessionResponse,
} from '@/shared/dto';
import {
  startRealtimeWebrtcClient,
  type RealtimeWebrtcClient,
} from '@/app/services/realtime/realtimeWebrtcClient';
import { useMicPermissionGate } from './useMicPermissionGate';
import { useRealtimeVoiceUiStore } from '@/app/stores/realtimeVoiceUi';

export function useRealtimeVoiceSession(options: {
  sessionId: string;
  onEvent?: (event: unknown) => void;
}) {
  const api = useAPI();
  const micPermissionGate = useMicPermissionGate();
  const realtimeVoiceUi = useRealtimeVoiceUiStore();
  const client = ref<RealtimeWebrtcClient | null>(null);
  const realtimeSession = ref<RealtimeSessionResponse | null>(null);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hardLimitTimer: ReturnType<typeof setTimeout> | null = null;
  let lastActivitySentAt = 0;

  const isActive = computed(() => realtimeVoiceUi.status === 'connected');
  const isBusy = computed(
    () =>
      realtimeVoiceUi.status === 'connecting' ||
      realtimeVoiceUi.status === 'stopping'
  );

  async function start() {
    if (client.value || isBusy.value) return;
    const priorPermissionState = await micPermissionGate.getPermissionState();
    if (!(await micPermissionGate.ensureCanStartCapture())) return;

    realtimeVoiceUi.setStatus('connecting');
    try {
      const session = await api<RealtimeSessionResponse>(
        '/api/realtime/session',
        {
          method: 'POST',
          body: { sessionId: options.sessionId },
        }
      );
      realtimeSession.value = session;
      scheduleSessionTimers(session);
      client.value = await startRealtimeWebrtcClient(session, {
        onEvent: options.onEvent,
        onActivity() {
          void registerRealtimeActivity();
        },
        onError(error) {
          const message =
            error instanceof Error ? error.message : 'Realtime voice error';
          void stop('network_error').finally(() => {
            realtimeVoiceUi.setError(message);
          });
        },
      });
      realtimeVoiceUi.setStatus('connected');
    } catch (error) {
      const handled = await micPermissionGate.handleStartFailure(error, {
        priorPermissionState,
      });
      realtimeVoiceUi.setError(
        handled
          ? 'Микрофон недоступен. Проверьте разрешение в браузере.'
          : extractApiError(error)
      );
      client.value?.stop();
      client.value = null;
      clearSessionTimers();
      await endServerSession('network_error').catch(() => {});
    }
  }

  async function stop(reason: RealtimeSessionEndReason = 'user_stop') {
    if (!client.value && !realtimeSession.value && realtimeVoiceUi.status === 'idle') {
      return;
    }
    realtimeVoiceUi.setStatus('stopping');
    try {
      client.value?.stop();
      clearSessionTimers();
      await endServerSession(reason);
    } finally {
      client.value = null;
      realtimeVoiceUi.reset();
    }
  }

  async function toggle() {
    if (client.value) {
      await stop('user_stop');
      return;
    }
    await start();
  }

  async function registerRealtimeActivity() {
    const session = realtimeSession.value;
    if (!session) return;
    scheduleIdleStop(session.idleTimeoutSeconds);

    const now = Date.now();
    if (now - lastActivitySentAt < 5_000) return;
    lastActivitySentAt = now;
    await api('/api/realtime/session/activity', {
      method: 'POST',
      body: { realtimeSessionId: session.realtimeSessionId },
    }).catch(() => {});
  }

  function scheduleSessionTimers(session: RealtimeSessionResponse) {
    clearSessionTimers();
    scheduleIdleStop(session.idleTimeoutSeconds);
    hardLimitTimer = setTimeout(() => {
      void stop('hard_limit');
    }, Math.max(1, session.maxDurationSeconds) * 1000);
  }

  function scheduleIdleStop(idleTimeoutSeconds: number) {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      void stop('idle_timeout');
    }, Math.max(1, idleTimeoutSeconds) * 1000);
  }

  function clearSessionTimers() {
    if (idleTimer) clearTimeout(idleTimer);
    if (hardLimitTimer) clearTimeout(hardLimitTimer);
    idleTimer = null;
    hardLimitTimer = null;
  }

  async function endServerSession(reason: RealtimeSessionEndReason) {
    const session = realtimeSession.value;
    if (!session) return;
    realtimeSession.value = null;
    await api('/api/realtime/session/end', {
      method: 'POST',
      body: {
        realtimeSessionId: session.realtimeSessionId,
        reason,
      },
    });
  }

  function endServerSessionWithBeacon(reason: RealtimeSessionEndReason) {
    const session = realtimeSession.value;
    if (!session || typeof window === 'undefined') return;
    realtimeSession.value = null;
    const body = JSON.stringify({
      realtimeSessionId: session.realtimeSessionId,
      reason,
    });
    fetch('/api/realtime/session/end', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...csrfHeader(),
      },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  function stopBeforePageLeave(reason: RealtimeSessionEndReason) {
    if (!client.value && !realtimeSession.value) return;
    client.value?.stop();
    client.value = null;
    clearSessionTimers();
    endServerSessionWithBeacon(reason);
    realtimeVoiceUi.reset();
  }

  function handlePageHide() {
    stopBeforePageLeave('page_leave');
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      stopBeforePageLeave('page_leave');
    }
  }

  onMounted(() => {
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', handlePageHide);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    stopBeforePageLeave('page_leave');
  });

  return {
    status: computed(() => realtimeVoiceUi.status),
    errorMessage: computed(() => realtimeVoiceUi.errorMessage),
    isActive,
    isBusy,
    activeSession: computed(() => realtimeSession.value),
    start,
    stop,
    toggle,
  };
}

function extractApiError(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: { message?: string } } }).data;
    return data?.error?.message || 'Не удалось запустить голосовой режим';
  }
  return error instanceof Error ? error.message : 'Не удалось запустить голосовой режим';
}

function csrfHeader(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const prefix = 'jobai_csrf=';
  const raw = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return raw ? { 'x-csrf-token': decodeURIComponent(raw.slice(prefix.length)) } : {};
}

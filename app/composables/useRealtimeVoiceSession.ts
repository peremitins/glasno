import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type {
  RealtimeSessionEndReason,
  RealtimeSessionResponse,
} from '@/shared/dto';
import {
  startRealtimeVoiceClient,
  type RealtimeVoiceClient,
} from '@/app/services/realtime/realtimeTransport';
import { useMicPermissionGate } from './useMicPermissionGate';
import { useAudioPermissionGate } from './useAudioPermissionGate';
import { useRealtimeVoiceUiStore } from '@/app/stores/realtimeVoiceUi';

export function useRealtimeVoiceSession(options: {
  sessionId: string;
  onEvent?: (event: unknown) => void;
}) {
  const api = useAPI();
  const micPermissionGate = useMicPermissionGate();
  const audioPermissionGate = useAudioPermissionGate();
  const realtimeVoiceUi = useRealtimeVoiceUiStore();
  const client = ref<RealtimeVoiceClient | null>(null);
  const realtimeSession = ref<RealtimeSessionResponse | null>(null);
  const assistantMicrophoneMuteResponseIds = new Set<string>();
  const physicalMicrophoneMuteEnabled = shouldPhysicallyMuteRealtimeMicrophone();
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
      client.value = await startRealtimeVoiceClient(session, {
        onEvent(event) {
          handleRealtimeTransportEvent(event);
          options.onEvent?.(event);
        },
        onActivity() {
          void registerRealtimeActivity();
        },
        onPlaybackBlocked(error) {
          audioPermissionGate.handlePlaybackFailure(error);
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
      resetAssistantMicrophoneMute();
      clearSessionTimers();
      await endServerSession('network_error').catch(() => {});
    }
  }

  async function stop(reason: RealtimeSessionEndReason = 'user_stop') {
    if (
      !client.value &&
      !realtimeSession.value &&
      realtimeVoiceUi.status === 'idle'
    ) {
      return;
    }
    realtimeVoiceUi.setStatus('stopping');
    try {
      resetAssistantMicrophoneMute();
      client.value?.stop();
      clearSessionTimers();
      await endServerSession(reason).catch((error) => {
        console.warn(
          '[RealtimeVoiceSession] failed to end server session',
          error
        );
      });
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

  async function restart() {
    if (
      !client.value &&
      !realtimeSession.value &&
      realtimeVoiceUi.status === 'idle'
    ) {
      return;
    }
    try {
      await stop('user_stop');
    } finally {
      await start();
    }
  }

  function handleRealtimeTransportEvent(event: unknown) {
    if (!event || typeof event !== 'object') return;
    const type = (event as { type?: unknown }).type;
    if (typeof type !== 'string') return;

    if (type === 'response.created') {
      muteMicrophoneForAssistantResponse(
        readResponseId((event as { response?: unknown }).response)
      );
      void registerRealtimeActivity();
      return;
    }

    if (type === 'output_audio_buffer.started') {
      muteMicrophoneForAssistantResponse(
        stringValue((event as { response_id?: unknown }).response_id)
      );
      void registerRealtimeActivity();
      return;
    }

    if (
      type === 'output_audio_buffer.stopped' ||
      type === 'response.done' ||
      type === 'response.cancelled' ||
      type === 'response.failed'
    ) {
      const responseId =
        type === 'response.done' ||
        type === 'response.cancelled' ||
        type === 'response.failed'
          ? readResponseId((event as { response?: unknown }).response)
          : stringValue((event as { response_id?: unknown }).response_id);
      if (!responseId) {
        resetAssistantMicrophoneMute();
        void registerRealtimeActivity();
        return;
      }
      unmuteMicrophoneForAssistantResponse(responseId);
      void registerRealtimeActivity();
    }
  }

  function updateAssistantMicrophoneMute() {
    if (!physicalMicrophoneMuteEnabled) return;
    client.value?.setMicrophoneEnabled(
      assistantMicrophoneMuteResponseIds.size < 1
    );
  }

  function muteMicrophoneForAssistantResponse(responseId: string) {
    if (!responseId) return;
    assistantMicrophoneMuteResponseIds.add(responseId);
    updateAssistantMicrophoneMute();
  }

  function unmuteMicrophoneForAssistantResponse(responseId: string) {
    if (!responseId) return;
    assistantMicrophoneMuteResponseIds.delete(responseId);
    updateAssistantMicrophoneMute();
  }

  function resetAssistantMicrophoneMute() {
    assistantMicrophoneMuteResponseIds.clear();
    if (!physicalMicrophoneMuteEnabled) return;
    client.value?.setMicrophoneEnabled(true);
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
      if (shouldDeferRealtimeIdleStop(assistantMicrophoneMuteResponseIds.size)) {
        void registerRealtimeActivity();
        return;
      }
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
    resetAssistantMicrophoneMute();
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
    restart,
    toggle,
  };
}

function extractApiError(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: { message?: string } } }).data;
    return data?.error?.message || 'Не удалось запустить голосовой режим';
  }
  return error instanceof Error
    ? error.message
    : 'Не удалось запустить голосовой режим';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readResponseId(response: unknown): string {
  return stringValue((response as { id?: unknown } | undefined)?.id);
}

export function shouldPhysicallyMuteRealtimeMicrophone(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): boolean {
  if (!userAgent) return true;
  // Firefox uses the WebSocket fallback: muting only gates outgoing PCM chunks
  // and does not disable the browser's MediaStreamTrack.
  if (/Firefox\//i.test(userAgent) || /FxiOS/i.test(userAgent)) return true;
  if (
    /Safari\//i.test(userAgent) &&
    !/(Chrome|CriOS|Chromium|Edg|YaBrowser)\//i.test(userAgent)
  ) {
    return false;
  }
  return true;
}

export function shouldDeferRealtimeIdleStop(
  activeAssistantResponseCount: number
): boolean {
  return activeAssistantResponseCount > 0;
}

function csrfHeader(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const prefix = 'jobai_csrf=';
  const raw = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return raw
    ? { 'x-csrf-token': decodeURIComponent(raw.slice(prefix.length)) }
    : {};
}

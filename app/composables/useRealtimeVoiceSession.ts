import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type {
  RealtimeSessionEndReason,
  RealtimeSessionResponse,
} from '@/shared/dto';
import {
  shouldUseRealtimeWebsocketTransport,
  startRealtimeVoiceClient,
  type RealtimeVoiceClient,
} from '@/app/services/realtime/realtimeTransport';
import { useMicPermissionGate } from './useMicPermissionGate';
import { useAudioPermissionGate } from './useAudioPermissionGate';
import { useRealtimeVoiceUiStore } from '@/app/stores/realtimeVoiceUi';

// Управление активной realtime-сессией «снаружи» (со страницы интервью):
// отправка клиентских событий OpenAI и мгновенная отмена ответа ассистента.
export interface RealtimeVoiceControl {
  sendEvent: (event: Record<string, unknown>) => void;
  cancelActiveResponses: () => void;
}

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
  // Пользователь сейчас говорит: сегмент речи открыт (пришёл
  // input_audio_buffer.speech_started, но ещё не speech_stopped). Пока он
  // открыт, сессию нельзя закрывать по тишине — сколько бы человек ни говорил.
  let userIsSpeaking = false;

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
        onKeepAlive() {
          // Держим серверную сессию живой, НО не трогаем таймер простоя:
          // фоновый звук/озвучка ассистента не должны отменять автоотключение
          // по тишине (30 сек без речи → сессия завершается, микрофон гаснет).
          void sendServerActivityPing();
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

    // Начало реплики пользователя: держим сегмент открытым, чтобы длинный
    // монолог (semantic_vad шлёт speech_started лишь один раз в начале) не
    // упёрся в idle-таймер и не оборвал сессию посреди речи.
    if (type === 'input_audio_buffer.speech_started') {
      userIsSpeaking = true;
      void registerRealtimeActivity();
      return;
    }

    // Реплика закончилась: только теперь запускаем честный отсчёт тишины (30с).
    if (type === 'input_audio_buffer.speech_stopped') {
      userIsSpeaking = false;
      void registerRealtimeActivity();
      return;
    }

    if (type === 'response.created') {
      // Ассистент отвечает — значит ход пользователя точно завершён
      // (страховка на случай потерянного speech_stopped).
      userIsSpeaking = false;
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

  // Отправка произвольного клиентского события в realtime-сессию
  // (conversation.item.create / response.create и т.п.). Без активного
  // соединения — no-op.
  function sendEvent(event: Record<string, unknown>) {
    client.value?.sendEvent(event);
  }

  // Мгновенно обрывает текущий ответ ассистента: отменяет активные response
  // (по известным id и «дефолтный» без id) и сбрасывает уже буферизованный
  // голос. Нужно, когда пользователь дал команду «следующий вопрос», а модель
  // успела начать говорить, — чтобы не было конфликта двух голосов.
  function cancelActiveResponses() {
    const activeClient = client.value;
    if (!activeClient) return;

    const events = buildRealtimeCancelEvents({
      activeResponseIds: assistantMicrophoneMuteResponseIds,
      websocketTransport: shouldUseRealtimeWebsocketTransport(),
    });
    for (const event of events) {
      activeClient.sendEvent(event);
    }
    resetAssistantMicrophoneMute();
  }

  // Значимая разговорная активность: сбрасывает таймер простоя и пингует сервер.
  async function registerRealtimeActivity() {
    const session = realtimeSession.value;
    if (!session) return;
    scheduleIdleStop(session.idleTimeoutSeconds);
    await sendServerActivityPing();
  }

  // Троттлинговый пинг серверной сессии (обновляет lastActivityAt), без сброса
  // клиентского таймера простоя.
  async function sendServerActivityPing() {
    const session = realtimeSession.value;
    if (!session) return;
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
      if (
        shouldDeferRealtimeIdleStop(
          assistantMicrophoneMuteResponseIds.size,
          userIsSpeaking
        )
      ) {
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
    userIsSpeaking = false;
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

  onMounted(() => {
    // Закрытие/перезагрузка вкладки должны завершить серверную сессию сразу.
    // Потеря фокуса, сворачивание браузера и переход на другую вкладку
    // остаются на idle-защите: через 30 секунд тишины stop('idle_timeout')
    // закроет микрофон, а серверный расчёт ограничит открытую сессию.
    window.addEventListener('pagehide', handlePageHide);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', handlePageHide);
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
    sendEvent,
    cancelActiveResponses,
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

// Набор событий для мгновенной отмены речи ассистента. Отменяем известные
// активные ответы по id, затем «дефолтный» (ответ мог стартовать до прихода
// response.created), а для WebRTC дополнительно чистим буфер уже отправленного
// в воспроизведение звука. Ошибки вида «нет активного ответа» безвредны.
export function buildRealtimeCancelEvents(input: {
  activeResponseIds: Iterable<string>;
  websocketTransport: boolean;
}): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const responseId of input.activeResponseIds) {
    events.push({ type: 'response.cancel', response_id: responseId });
  }
  events.push({ type: 'response.cancel' });
  if (!input.websocketTransport) {
    events.push({ type: 'output_audio_buffer.clear' });
  }
  return events;
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

// Idle-остановку откладываем, пока (а) ассистент ещё озвучивает ответ, либо
// (б) пользователь ещё говорит (открыт речевой сегмент). Во втором случае
// тишины по сути нет: semantic_vad с eagerness 'low' присылает speech_started
// один раз в начале длинной реплики и молчит до speech_stopped, поэтому без
// этой проверки 30-секундный таймер срубал бы сессию посреди рассказа.
export function shouldDeferRealtimeIdleStop(
  activeAssistantResponseCount: number,
  userIsSpeaking = false
): boolean {
  return activeAssistantResponseCount > 0 || userIsSpeaking;
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

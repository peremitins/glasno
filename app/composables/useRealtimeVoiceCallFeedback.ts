import { onScopeDispose, watch, type Ref } from 'vue';
import type { RealtimeVoiceStatus } from '@/app/stores/realtimeVoiceUi';
import { useAudioPermissionGate } from './useAudioPermissionGate';

// Звуковая обратная связь realtime-звонка (порт из Mentai, web-версия):
// — пока идёт соединение ('connecting') — повторяющийся «гудок вызова»;
// — когда соединились ('connected') — короткий сигнал готовности (/chat_on.wav),
//   «можно говорить»;
// — при ошибке/разъединении — глушим всё.
// Тон вызова синтезируется через WebAudio; сигнал готовности — wav-файл с
// синтез-фолбэком. Капаситор/нативные хаптики не нужны — заменены на
// navigator.vibrate, где доступно.
export function useRealtimeVoiceCallFeedback(params: {
  status: Ref<RealtimeVoiceStatus>;
  errorMessage: Ref<string>;
}) {
  const audioPermissionGate = useAudioPermissionGate();
  const READY_CUE_PATH = '/chat_on.wav';
  let audioContext: AudioContext | null = null;
  let connectingToneTimer: ReturnType<typeof setInterval> | null = null;
  let connectingToneActive = false;
  let lastNotifiedError = '';
  let readyCueBuffer: AudioBuffer | null = null;
  let readyCueBufferPromise: Promise<AudioBuffer | null> | null = null;
  let readyCueAudioElement: HTMLAudioElement | null = null;

  function canUseBrowserAudio(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  function getAudioContextCtor(): typeof AudioContext | null {
    if (!canUseBrowserAudio()) return null;
    return (
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext ||
      null
    );
  }

  async function ensureAudioContext(): Promise<AudioContext | null> {
    const ctor = getAudioContextCtor();
    if (!ctor) return null;

    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new ctor();
    }
    if (audioContext.state !== 'running') {
      try {
        await audioContext.resume();
      } catch (error) {
        audioPermissionGate.handlePlaybackFailure(error);
        console.error('[RealtimeVoiceCallFeedback] resume failed:', error);
      }
    }
    return audioContext;
  }

  function resolveReadyCueUrl(): string | null {
    if (!canUseBrowserAudio()) return null;
    try {
      return new URL(READY_CUE_PATH, window.location.origin).toString();
    } catch {
      return null;
    }
  }

  function ensureReadyCueAudioElement(): HTMLAudioElement | null {
    if (!canUseBrowserAudio()) return null;
    if (!readyCueAudioElement) {
      const url = resolveReadyCueUrl();
      if (!url) return null;
      readyCueAudioElement = new Audio(url);
      readyCueAudioElement.preload = 'auto';
      readyCueAudioElement.setAttribute('playsinline', 'true');
    }
    return readyCueAudioElement;
  }

  async function warmReadyCueBuffer(): Promise<AudioBuffer | null> {
    if (readyCueBuffer) return readyCueBuffer;
    if (readyCueBufferPromise) return readyCueBufferPromise;

    readyCueBufferPromise = (async () => {
      const url = resolveReadyCueUrl();
      if (!url) return null;
      const context = await ensureAudioContext();
      if (!context) return null;
      try {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const sourceBuffer = await response.arrayBuffer();
        readyCueBuffer = await context.decodeAudioData(sourceBuffer.slice(0));
        return readyCueBuffer;
      } catch (error) {
        console.error('[RealtimeVoiceCallFeedback] preload cue failed:', error);
        return null;
      } finally {
        readyCueBufferPromise = null;
      }
    })();

    return readyCueBufferPromise;
  }

  async function warmReadyCueAssets() {
    const audio = ensureReadyCueAudioElement();
    if (audio) {
      try {
        audio.load();
      } catch {
        // не критично
      }
    }
    await warmReadyCueBuffer();
  }

  function scheduleTonePulse(
    context: AudioContext,
    startAt: number,
    durationSeconds: number
  ) {
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.018, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSeconds);

    const a = context.createOscillator();
    const b = context.createOscillator();
    a.type = 'sine';
    b.type = 'sine';
    a.frequency.setValueAtTime(440, startAt);
    b.frequency.setValueAtTime(554.37, startAt);
    a.connect(gain);
    b.connect(gain);

    const dispose = () => {
      try {
        a.disconnect();
        b.disconnect();
        gain.disconnect();
      } catch {
        // узлы могли быть уже удалены
      }
    };
    b.addEventListener('ended', dispose, { once: true });

    a.start(startAt);
    b.start(startAt);
    a.stop(startAt + durationSeconds);
    b.stop(startAt + durationSeconds);
  }

  function playConnectingPulse(context: AudioContext) {
    const pulseStart = context.currentTime + 0.01;
    scheduleTonePulse(context, pulseStart, 0.18);
    scheduleTonePulse(context, pulseStart + 0.34, 0.18);
  }

  async function startConnectingTone() {
    if (connectingToneActive) return;
    const context = await ensureAudioContext();
    if (!context) return;

    connectingToneActive = true;
    playConnectingPulse(context);
    void warmReadyCueAssets();

    connectingToneTimer = setInterval(() => {
      if (!audioContext || !connectingToneActive) return;
      playConnectingPulse(audioContext);
    }, 1_650);
  }

  function resetReadyCuePlayback() {
    if (!readyCueAudioElement) return;
    try {
      readyCueAudioElement.pause();
      readyCueAudioElement.currentTime = 0;
    } catch {
      // не критично
    }
  }

  function stopConnectingTone() {
    connectingToneActive = false;
    if (connectingToneTimer) {
      clearInterval(connectingToneTimer);
      connectingToneTimer = null;
    }
    suspendAudioContextIfIdle();
  }

  // Во время realtime-звонка контекст обязан быть suspended: на iOS запущенный
  // «лишний» AudioContext параллельно с WebRTC-выводом даёт треск и прерывания
  // голоса ассистента (WebKit пересэмплирует вывод под живой контекст).
  function suspendAudioContextIfIdle() {
    if (connectingToneActive) return;
    if (audioContext && audioContext.state === 'running') {
      void audioContext.suspend().catch(() => {});
    }
  }

  function resetAllAudioFeedback() {
    stopConnectingTone();
    resetReadyCuePlayback();
  }

  async function playReadyCueWithAudioBuffer(): Promise<boolean> {
    const context = await ensureAudioContext();
    if (!context) return false;
    const buffer = await warmReadyCueBuffer();
    if (!buffer) return false;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      const startAt = context.currentTime + 0.01;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.92, startAt);
      const dispose = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // узлы могли быть уже освобождены
        }
        // Сигнал доигран — контекст больше не нужен до следующего звонка.
        suspendAudioContextIfIdle();
      };
      source.addEventListener('ended', dispose, { once: true });
      source.start(startAt);
      return true;
    } catch (error) {
      audioPermissionGate.handlePlaybackFailure(error);
      return false;
    }
  }

  async function playReadyCueWithHtmlAudio(): Promise<boolean> {
    const audio = ensureReadyCueAudioElement();
    if (!audio) return false;
    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  async function playReadyCue(): Promise<void> {
    if (await playReadyCueWithAudioBuffer()) return;
    if (await playReadyCueWithHtmlAudio()) return;
    const context = await ensureAudioContext();
    if (!context) return;
    playConnectingPulse(context);
    // Пульс-фолбэк длится ~0.6с; после него контекст тоже возвращаем в suspended.
    setTimeout(suspendAudioContextIfIdle, 900);
  }

  function vibrate(pattern: number | number[]) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // не критично
      }
    }
  }

  // Вызывается из обработчика клика «начать разговор»: разблокирует аудио
  // (resume в рамках жеста пользователя) и прогревает сигнал готовности.
  async function notifyCallIntent(): Promise<void> {
    lastNotifiedError = '';
    vibrate(24);
    await ensureAudioContext();
    void warmReadyCueAssets();
  }

  function notifyHangupIntent(): void {
    vibrate(40);
    resetAllAudioFeedback();
  }

  watch(
    () => params.status.value,
    (nextStatus, previousStatus) => {
      if (nextStatus === 'connecting') {
        void startConnectingTone();
        return;
      }

      resetAllAudioFeedback();

      if (previousStatus === 'connecting' && nextStatus === 'connected') {
        void Promise.allSettled([playReadyCue()]);
        vibrate([24, 20, 24]);
      }
    }
  );

  watch(
    () => params.errorMessage.value,
    (nextMessage) => {
      const normalized = String(nextMessage || '').trim();
      if (!normalized) {
        lastNotifiedError = '';
        return;
      }
      resetAllAudioFeedback();
      if (normalized === lastNotifiedError) return;
      lastNotifiedError = normalized;
      vibrate([60, 28, 60]);
    }
  );

  onScopeDispose(() => {
    resetAllAudioFeedback();
    if (readyCueAudioElement) {
      try {
        readyCueAudioElement.pause();
        readyCueAudioElement.src = '';
      } catch {
        // не критично
      }
      readyCueAudioElement = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => {});
    }
    audioContext = null;
  });

  return {
    notifyCallIntent,
    notifyHangupIntent,
  };
}

import type { RealtimeSessionResponse } from '@/shared/dto';

type RealtimeVoiceWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const INPUT_ACTIVITY_VOLUME_THRESHOLD = 4;
const INPUT_ACTIVITY_CHECK_INTERVAL_MS = 750;
const INPUT_ACTIVITY_THROTTLE_MS = 1_500;
const REMOTE_AUDIO_ACTIVITY_THROTTLE_MS = 4_000;
const ICE_GATHERING_TIMEOUT_MS = 3_000;

export interface RealtimeWebrtcClient {
  stop(): void;
  setMicrophoneEnabled(enabled: boolean): void;
  sendEvent(event: Record<string, unknown>): void;
}

export interface RealtimeVoiceClientOptions {
  onEvent?: (event: unknown) => void;
  onError?: (error: unknown) => void;
  // Значимая разговорная активность (речь пользователя по VAD, транскрипты,
  // события ответа модели) — сбрасывает таймер простоя (idle-отключение).
  onActivity?: () => void;
  // «Фоновый» сигнал жизни соединения (амбиентный уровень микрофона,
  // технические heartbeat-и). Держит серверную сессию живой, но
  // НЕ сбрасывает таймер простоя — иначе тишина никогда не приводит к
  // автоотключению (фоновый шум постоянно «переставлял» бы таймер).
  onKeepAlive?: () => void;
  // Реальное воспроизведение голоса ассистента: это уже не тишина, поэтому
  // сбрасывает idle-таймер до момента, когда интервьюер замолчит.
  onAssistantAudioActivity?: () => void;
  onPlaybackBlocked?: (error: unknown) => void;
  // SDP-обмен идёт через наш бэкенд (/api/realtime/session/sdp — AI-relay),
  // а не напрямую в OpenAI из браузера: прямой вызов упирается в гео-блок
  // из РФ. Обязателен для startRealtimeWebrtcClient.
  exchangeSdp?: (offerSdp: string) => Promise<string>;
}

export async function startRealtimeWebrtcClient(
  session: RealtimeSessionResponse,
  options: RealtimeVoiceClientOptions = {}
): Promise<RealtimeWebrtcClient> {
  if (typeof window === 'undefined') {
    throw new Error('Realtime voice доступен только в браузере');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Браузер не поддерживает захват микрофона');
  }
  if (!options.exchangeSdp) {
    throw new Error('Realtime SDP exchange is not configured');
  }

  const peerConnection = new RTCPeerConnection();
  let stopped = false;
  // number, а не ReturnType<typeof setInterval>: в браузере setInterval
  // возвращает number, а @types/node подмешивает перегрузку с Timeout.
  let inputActivityInterval: number | null = null;
  let inputAudioContext: AudioContext | null = null;
  let inputAudioSource: MediaStreamAudioSourceNode | null = null;
  let inputAnalyser: AnalyserNode | null = null;
  let lastInputActivityAtMs = 0;
  let lastRemoteAudioActivityAtMs = 0;

  // Элемент воспроизведения голоса ассистента. Важно: «отвязанный»
  // (не добавленный в DOM) <audio> с autoplay браузеры часто глушат,
  // поэтому добавляем скрытый элемент в DOM и явно вызываем play().
  const remoteAudio = document.createElement('audio');
  remoteAudio.autoplay = true;
  // playsInline — чтобы iOS/Safari не открывали нативный плеер.
  remoteAudio.setAttribute('playsinline', '');
  remoteAudio.muted = false;
  remoteAudio.volume = 1;
  remoteAudio.style.display = 'none';
  document.body.appendChild(remoteAudio);

  const notifyRemoteAudioActivity = () => {
    if (stopped) return;
    const now = Date.now();
    if (
      !shouldNotifyRemoteAudioPlaybackActivity({
        now,
        lastRemoteAudioActivityAtMs,
      })
    ) {
      return;
    }

    lastRemoteAudioActivityAtMs = now;
    options.onAssistantAudioActivity?.();
  };

  remoteAudio.addEventListener('playing', notifyRemoteAudioActivity);
  remoteAudio.addEventListener('timeupdate', notifyRemoteAudioActivity);
  remoteAudio.addEventListener('ended', notifyRemoteAudioActivity);

  const playRemoteAudio = () => {
    const promise = remoteAudio.play();
    if (promise && typeof promise.catch === 'function') {
      promise
        .then(() => {
          notifyRemoteAudioActivity();
        })
        .catch((error) => {
          // Автовоспроизведение могли заблокировать. Сессию не рвём (это
          // оборвало бы и распознавание) — показываем пользователю инструкцию.
          console.warn('Realtime remote audio play() blocked', error);
          options.onPlaybackBlocked?.(error);
        });
    }
  };

  const mediaStream = await navigator.mediaDevices.getUserMedia(
    buildRealtimeAudioConstraints()
  );

  // addTrack создаёт sendrecv аудио-трансивер: на нём же ассистент
  // присылает свой голос обратно (ontrack ниже).
  for (const track of mediaStream.getTracks()) {
    peerConnection.addTrack(track, mediaStream);
  }
  startInputActivityMonitor();

  peerConnection.ontrack = (event) => {
    const [stream] = event.streams;
    remoteAudio.srcObject = stream ?? new MediaStream([event.track]);
    playRemoteAudio();
  };

  peerConnection.onconnectionstatechange = () => {
    if (
      peerConnection.connectionState === 'failed' ||
      peerConnection.connectionState === 'disconnected'
    ) {
      options.onError?.(
        new Error(`Realtime connection ${peerConnection.connectionState}`)
      );
    }
    if (peerConnection.connectionState === 'connected') {
      options.onActivity?.();
    }
  };

  const dataChannel = peerConnection.createDataChannel('oai-events');
  dataChannel.onopen = () => options.onActivity?.();
  dataChannel.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (isRealtimeActivityEvent(payload)) {
        options.onActivity?.();
      }
      options.onEvent?.(payload);
    } catch {
      options.onActivity?.();
      options.onEvent?.(event.data);
    }
  };
  dataChannel.onerror = (event) => options.onError?.(event);

  const offer = await peerConnection.createOffer({
    offerToReceiveAudio: true,
  });
  await peerConnection.setLocalDescription(offer);
  await waitForRealtimeIceGatheringComplete(peerConnection);
  const localDescription = peerConnection.localDescription;
  if (!localDescription?.sdp) {
    throw new Error('Realtime voice offer SDP is empty');
  }

  // GA Realtime API: SDP-обмен идёт на /v1/realtime/calls (beta /v1/realtime
  // отключён), но через наш бэкенд и AI-relay, а не напрямую из браузера.
  const answerSdp = await options.exchangeSdp(localDescription.sdp);
  await peerConnection.setRemoteDescription({
    type: 'answer',
    sdp: answerSdp,
  });

  function stop() {
    stopped = true;
    stopInputActivityMonitor();
    try {
      dataChannel.close();
    } catch {
      // Канал мог быть уже закрыт браузером.
    }
    for (const sender of peerConnection.getSenders()) {
      sender.track?.stop();
    }
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    remoteAudio.pause();
    remoteAudio.srcObject = null;
    remoteAudio.remove();
    peerConnection.close();
  }

  function setMicrophoneEnabled(enabled: boolean) {
    for (const track of mediaStream.getAudioTracks()) {
      track.enabled = enabled;
    }
  }

  function sendEvent(event: Record<string, unknown>) {
    if (dataChannel.readyState !== 'open') return;
    dataChannel.send(JSON.stringify(event));
  }

  return { stop, setMicrophoneEnabled, sendEvent };

  function startInputActivityMonitor() {
    if (!options.onKeepAlive || typeof window === 'undefined') return;
    const AudioContextCtor =
      window.AudioContext ||
      (window as RealtimeVoiceWindow).webkitAudioContext ||
      null;
    if (!AudioContextCtor) return;

    try {
      stopInputActivityMonitor();
      inputAudioContext = new AudioContextCtor();
      inputAnalyser = inputAudioContext.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyser.smoothingTimeConstant = 0.8;
      inputAudioSource = inputAudioContext.createMediaStreamSource(mediaStream);
      inputAudioSource.connect(inputAnalyser);
      lastInputActivityAtMs = 0;

      inputActivityInterval = window.setInterval(() => {
        if (!inputAnalyser || stopped) return;
        const data = new Uint8Array(inputAnalyser.frequencyBinCount);
        inputAnalyser.getByteTimeDomainData(data);

        const now = Date.now();
        const volume = computeRealtimeInputVolume(data);
        if (
          !shouldNotifyRealtimeInputActivity({
            volume,
            now,
            lastInputActivityAtMs,
          })
        ) {
          return;
        }

        lastInputActivityAtMs = now;
        // Амбиентный уровень микрофона держит соединение живым, но не сбрасывает
        // таймер простоя — тишину определяем по отсутствию РЕЧИ (VAD), а не звука.
        options.onKeepAlive?.();
      }, INPUT_ACTIVITY_CHECK_INTERVAL_MS);
    } catch (error) {
      console.warn(
        '[RealtimeWebrtcClient] Failed to start input activity monitor',
        error
      );
      stopInputActivityMonitor();
    }
  }

  function stopInputActivityMonitor() {
    if (inputActivityInterval) {
      clearInterval(inputActivityInterval);
      inputActivityInterval = null;
    }
    if (inputAudioSource) {
      try {
        inputAudioSource.disconnect();
      } catch {
        // Already disconnected.
      }
      inputAudioSource = null;
    }
    inputAnalyser = null;
    if (inputAudioContext) {
      void inputAudioContext.close().catch(() => {});
      inputAudioContext = null;
    }
    lastInputActivityAtMs = 0;
  }
}

export function buildRealtimeAudioConstraints(): MediaStreamConstraints {
  return {
    audio: {
      channelCount: { ideal: 1 },
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
    },
  };
}

export function computeRealtimeInputVolume(data: Uint8Array): number {
  if (data.length < 1) return 0;

  let sum = 0;
  for (let index = 0; index < data.length; index += 1) {
    const sample = data[index] ?? 128;
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }

  return Math.round(Math.sqrt(sum / data.length) * 100);
}

export function shouldNotifyRealtimeInputActivity(input: {
  volume: number;
  now: number;
  lastInputActivityAtMs: number;
}): boolean {
  return (
    input.volume > INPUT_ACTIVITY_VOLUME_THRESHOLD &&
    input.now - input.lastInputActivityAtMs >= INPUT_ACTIVITY_THROTTLE_MS
  );
}

export function shouldNotifyRemoteAudioPlaybackActivity(input: {
  now: number;
  lastRemoteAudioActivityAtMs: number;
}): boolean {
  return (
    input.lastRemoteAudioActivityAtMs <= 0 ||
    input.now - input.lastRemoteAudioActivityAtMs >=
      REMOTE_AUDIO_ACTIVITY_THROTTLE_MS
  );
}

export async function waitForRealtimeIceGatheringComplete(
  connection: RTCPeerConnection,
  timeoutMs = ICE_GATHERING_TIMEOUT_MS
) {
  if (connection.iceGatheringState === 'complete') return;

  await new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      connection.removeEventListener(
        'icegatheringstatechange',
        handleIceGatheringChange
      );
      resolve();
    }, timeoutMs);

    function handleIceGatheringChange() {
      if (connection.iceGatheringState !== 'complete') return;
      clearTimeout(timeoutId);
      connection.removeEventListener(
        'icegatheringstatechange',
        handleIceGatheringChange
      );
      resolve();
    }

    connection.addEventListener(
      'icegatheringstatechange',
      handleIceGatheringChange
    );
  });
}

export function isRealtimeActivityEvent(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false;
  const type = (event as { type?: unknown }).type;
  if (typeof type !== 'string') return false;
  return (
    type === 'input_audio_buffer.speech_started' ||
    type === 'input_audio_buffer.speech_stopped' ||
    type.startsWith('conversation.item.input_audio_transcription.') ||
    type.startsWith('response.audio_transcript.') ||
    type.startsWith('response.output_audio_transcript.') ||
    type.startsWith('output_audio_buffer.') ||
    type === 'response.created' ||
    type === 'response.done'
  );
}

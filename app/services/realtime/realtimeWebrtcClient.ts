import type { RealtimeSessionResponse } from '@/shared/dto';

type RealtimeVoiceWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const INPUT_ACTIVITY_VOLUME_THRESHOLD = 4;
const INPUT_ACTIVITY_CHECK_INTERVAL_MS = 750;
const INPUT_ACTIVITY_THROTTLE_MS = 1_500;
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
  // Используется WebSocket-транспортом для фактических PCM-чанков. В WebRTC
  // границу речи задают события output_audio_buffer, а не MediaStream.
  onAssistantAudioActivity?: () => void;
  onPlaybackBlocked?: (error: unknown) => void;
  // SDP-обмен идёт через наш бэкенд (/api/realtime/session/sdp — AI-relay),
  // а не напрямую в OpenAI из браузера: прямой вызов упирается в гео-блок
  // из РФ. Обязателен для startRealtimeWebrtcClient.
  exchangeSdp?: (offerSdp: string) => Promise<string>;
}

export interface RealtimePlaybackAudioRoute {
  readonly ready: Promise<boolean>;
  stop(): void;
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
  let playbackAudioRoute: RealtimePlaybackAudioRoute | null = null;
  let playbackAudioRouteRequestId = 0;

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

  const playRemoteAudio = async (stream: MediaStream) => {
    try {
      await remoteAudio.play();
    } catch (error) {
      // Автовоспроизведение могли заблокировать. Сессию не рвём (это
      // оборвало бы и распознавание) — показываем пользователю инструкцию.
      console.warn('Realtime remote audio play() blocked', error);
      options.onPlaybackBlocked?.(error);
      return;
    }

    if (stopped || !shouldUseRealtimePlaybackAudioRoute()) return;

    const AudioContextCtor =
      window.AudioContext ||
      (window as RealtimeVoiceWindow).webkitAudioContext ||
      null;
    if (!AudioContextCtor) return;

    const requestId = ++playbackAudioRouteRequestId;
    playbackAudioRoute?.stop();
    playbackAudioRoute = null;

    const nextRoute = createRealtimePlaybackAudioRoute({
      stream,
      remoteAudio,
      AudioContextCtor,
    });
    if (!nextRoute) return;

    // Регистрируем route до resume(): stop() должен уметь немедленно закрыть
    // даже зависший pending AudioContext.
    playbackAudioRoute = nextRoute;
    const routeReady = await nextRoute.ready;
    if (
      stopped ||
      !routeReady ||
      requestId !== playbackAudioRouteRequestId
    ) {
      nextRoute?.stop();
      if (playbackAudioRoute === nextRoute) {
        playbackAudioRoute = null;
      }
      return;
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
    const remoteStream = stream ?? new MediaStream([event.track]);
    remoteAudio.srcObject = remoteStream;
    void playRemoteAudio(remoteStream);
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
    playbackAudioRouteRequestId += 1;
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
    playbackAudioRoute?.stop();
    playbackAudioRoute = null;
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

/**
 * На Android при одновременно открытом микрофоне Chrome/Samsung Internet
 * могут показывать громкость звонка, хотя удалённый WebRTC-поток фактически
 * звучит как Media. Явный playback-контекст делает слышимый output полноценной
 * media-сессией, поэтому аппаратные клавиши управляют тем же потоком.
 */
export function shouldUseRealtimePlaybackAudioRoute(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): boolean {
  return /Android/i.test(userAgent);
}

/**
 * Создаёт Android-web маршрут remote stream -> Web Audio destination.
 * HTMLAudioElement остаётся muted-«заводилкой» WebRTC-пайплайна: на части
 * Chromium-устройств один createMediaStreamSource(remoteStream) может молчать.
 * Физический sink намеренно не выбираем — динамик, проводную или Bluetooth-
 * гарнитуру продолжает переключать ОС.
 */
export function createRealtimePlaybackAudioRoute(input: {
  stream: MediaStream;
  remoteAudio: HTMLAudioElement;
  AudioContextCtor: typeof AudioContext;
}): RealtimePlaybackAudioRoute | null {
  let audioContext: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;

  try {
    audioContext = new input.AudioContextCtor({ latencyHint: 'playback' });
    source = audioContext.createMediaStreamSource(input.stream);
    source.connect(audioContext.destination);
  } catch (error) {
    try {
      source?.disconnect();
    } catch {
      // Узел мог не успеть подключиться.
    }
    if (audioContext) {
      void audioContext.close().catch(() => {});
    }
    input.remoteAudio.muted = false;
    console.warn(
      '[RealtimeWebrtcClient] Playback audio route unavailable, using direct WebRTC audio',
      error
    );
    return null;
  }

  let stopped = false;
  let directAudioMutedByRoute = false;

  const syncDirectAudioFallback = () => {
    if (stopped || !audioContext) return;
    const routeIsRunning = audioContext.state === 'running';
    // При suspended/interrupted/closed сразу возвращаем прямой WebRTC-output.
    // Если браузер сам восстановит контекст, снова убираем дублирование.
    input.remoteAudio.muted = routeIsRunning;
    directAudioMutedByRoute = routeIsRunning;
  };

  const handleAudioContextStateChange = () => {
    syncDirectAudioFallback();
    if (
      !stopped &&
      audioContext &&
      audioContext.state !== 'running' &&
      audioContext.state !== 'closed'
    ) {
      // После возврата в Telegram/браузер пытаемся вернуть playback-route.
      // Пока resume запрещён или ждёт audio focus, прямой output уже размьючен.
      void audioContext.resume().catch(() => {});
    }
  };

  audioContext.addEventListener('statechange', handleAudioContextStateChange);

  function stopRoute() {
    if (stopped) return;
    stopped = true;
    audioContext?.removeEventListener(
      'statechange',
      handleAudioContextStateChange
    );
    if (directAudioMutedByRoute) {
      input.remoteAudio.muted = false;
      directAudioMutedByRoute = false;
    }
    try {
      source?.disconnect();
    } catch {
      // Узел мог быть уже отключён браузером при смене аудиоустройства.
    }
    source = null;
    if (audioContext) {
      try {
        void audioContext.close().catch(() => {});
      } catch {
        // Контекст мог закрыться одновременно с pagehide.
      }
      audioContext = null;
    }
  }

  const ready = (async () => {
    try {
      if (audioContext?.state !== 'running') {
        await audioContext?.resume();
      }
      if (stopped) return false;
      if (audioContext?.state !== 'running') {
        throw new Error(`AudioContext state is ${audioContext?.state}`);
      }

      // Прямой элемент уже запущен и продолжает «толкать» remote stream, но
      // слышимый звук теперь идёт только через playback-контекст.
      syncDirectAudioFallback();
      return true;
    } catch (error) {
      if (!stopped) {
        console.warn(
          '[RealtimeWebrtcClient] Playback audio route did not start, using direct WebRTC audio',
          error
        );
        stopRoute();
      }
      return false;
    }
  })();

  return { ready, stop: stopRoute };
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

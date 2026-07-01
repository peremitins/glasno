import type { RealtimeSessionResponse } from '@/shared/dto';
import {
  buildRealtimeAudioConstraints,
  shouldNotifyRealtimeInputActivity,
  type RealtimeVoiceClientOptions,
  type RealtimeWebrtcClient,
} from './realtimeWebrtcClient';

type RealtimeVoiceWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const REALTIME_WEBSOCKET_SAMPLE_RATE = 24_000;
const REALTIME_WEBSOCKET_BUFFER_SIZE = 4_096;
const REALTIME_PROXY_CONNECTED_EVENT_TYPE = 'jobai.realtime_proxy.connected';
const REALTIME_PROXY_CONNECT_EVENT_TYPE = 'jobai.realtime_proxy.connect';

export async function startRealtimeWebsocketClient(
  session: RealtimeSessionResponse,
  options: RealtimeVoiceClientOptions = {}
): Promise<RealtimeWebrtcClient> {
  if (typeof window === 'undefined') {
    throw new Error('Realtime voice доступен только в браузере');
  }
  if (typeof WebSocket === 'undefined') {
    throw new Error('Браузер не поддерживает WebSocket');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Браузер не поддерживает захват микрофона');
  }

  const AudioContextCtor =
    window.AudioContext ||
    (window as RealtimeVoiceWindow).webkitAudioContext ||
    null;
  if (!AudioContextCtor) {
    throw new Error('Браузер не поддерживает Web Audio');
  }

  const mediaStream = await navigator.mediaDevices.getUserMedia(
    buildRealtimeAudioConstraints()
  );
  const inputContext = new AudioContextCtor({
    sampleRate: REALTIME_WEBSOCKET_SAMPLE_RATE,
  });
  const outputContext = new AudioContextCtor({
    sampleRate: REALTIME_WEBSOCKET_SAMPLE_RATE,
  });
  await resumeRealtimeAudioContext(inputContext, options);
  await resumeRealtimeAudioContext(outputContext, options);

  const ws = new WebSocket(buildRealtimeProxyWebsocketUrl(window.location));
  ws.binaryType = 'arraybuffer';

  let stopped = false;
  let microphoneEnabled = true;
  let lastInputActivityAtMs = 0;
  let nextPlaybackAt = 0;
  let playbackQueue = Promise.resolve();
  let proxyConnected = false;
  let rejectProxyConnection: (error: Error) => void = () => {};

  const source = inputContext.createMediaStreamSource(mediaStream);
  const processor = inputContext.createScriptProcessor(
    REALTIME_WEBSOCKET_BUFFER_SIZE,
    1,
    1
  );
  const silentOutput = inputContext.createGain();
  silentOutput.gain.value = 0;

  processor.onaudioprocess = (event) => {
    if (
      !shouldSendRealtimeWebsocketAudio({
        microphoneEnabled,
        readyState: ws.readyState,
      })
    ) {
      return;
    }

    const input = event.inputBuffer.getChannelData(0);
    const volume = computeRealtimeFloat32Volume(input);
    const now = Date.now();
    if (
      shouldNotifyRealtimeInputActivity({
        volume,
        now,
        lastInputActivityAtMs,
      })
    ) {
      lastInputActivityAtMs = now;
      options.onActivity?.();
    }

    const resampled = resampleFloat32Audio(
      input,
      inputContext.sampleRate,
      REALTIME_WEBSOCKET_SAMPLE_RATE
    );
    ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: bytesToBase64(float32ToPcm16Bytes(resampled)),
      })
    );
  };

  ws.onmessage = (event) => {
    try {
      const payload = parseRealtimeWebsocketMessage(event.data);
      if (isRealtimeProxyConnectedEvent(payload)) return;
      const errorMessage = extractRealtimeWebsocketErrorMessage(payload);
      if (errorMessage) {
        handleRealtimeWebsocketError(new Error(errorMessage));
        return;
      }
      const audioDelta = extractRealtimeWebsocketAudioDelta(payload);
      if (audioDelta) enqueueAudioPlayback(audioDelta);
      options.onEvent?.(payload);
    } catch {
      options.onActivity?.();
      options.onEvent?.(event.data);
    }
  };

  ws.onerror = (event) => {
    if (stopped) return;
    handleRealtimeWebsocketError(new Error('Realtime WebSocket error'));
  };
  ws.onclose = (event) => {
    if (stopped || event.code === 1000) return;
    handleRealtimeWebsocketError(
      new Error(`Realtime WebSocket closed: ${event.code || 'unknown'}`)
    );
  };

  await waitForRealtimeWebsocketOpen(ws);
  const proxyConnectedPromise = waitForRealtimeProxyConnected(ws, {
    onRejectReady(reject) {
      rejectProxyConnection = reject;
    },
  });
  ws.send(JSON.stringify(buildRealtimeProxyConnectEvent(session)));
  await proxyConnectedPromise;
  proxyConnected = true;

  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(inputContext.destination);
  options.onActivity?.();

  function stop() {
    stopped = true;
    processor.onaudioprocess = null;
    try {
      source.disconnect();
      processor.disconnect();
      silentOutput.disconnect();
    } catch {
      // Nodes can already be disconnected during browser teardown.
    }
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    if (
      ws.readyState === WebSocket.CONNECTING ||
      ws.readyState === WebSocket.OPEN
    ) {
      ws.close(1000, 'client_stop');
    }
    void inputContext.close().catch(() => {});
    void outputContext.close().catch(() => {});
  }

  function setMicrophoneEnabled(enabled: boolean) {
    microphoneEnabled = enabled;
  }

  function sendEvent(event: Record<string, unknown>) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(event));
  }

  function enqueueAudioPlayback(audioBase64: string) {
    playbackQueue = playbackQueue
      .then(() => playRealtimeAudioDelta(audioBase64))
      .catch((error) => {
        if (stopped) return;
        options.onPlaybackBlocked?.(error);
      });
  }

  async function playRealtimeAudioDelta(audioBase64: string) {
    if (stopped) return;
    await resumeRealtimeAudioContext(outputContext, options);
    const samples = pcm16BytesToFloat32(base64ToUint8Array(audioBase64));
    if (samples.length < 1) return;

    const audioBuffer = outputContext.createBuffer(
      1,
      samples.length,
      REALTIME_WEBSOCKET_SAMPLE_RATE
    );
    audioBuffer.copyToChannel(samples, 0);

    const bufferSource = outputContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(outputContext.destination);
    bufferSource.onended = () => {
      if (!stopped) options.onActivity?.();
    };

    const startAt = Math.max(outputContext.currentTime + 0.02, nextPlaybackAt);
    nextPlaybackAt = startAt + audioBuffer.duration;
    bufferSource.start(startAt);
    options.onActivity?.();
  }

  return { stop, setMicrophoneEnabled, sendEvent };

  function handleRealtimeWebsocketError(error: Error) {
    if (stopped) return;
    if (!proxyConnected) {
      rejectProxyConnection(error);
      return;
    }
    options.onError?.(error);
  }
}

export function buildRealtimeProxyWebsocketUrl(input: {
  protocol: string;
  host: string;
}): string {
  const wsProtocol = input.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${input.host}/api/realtime/openai-websocket`;
}

export function buildRealtimeProxyConnectEvent(
  session: RealtimeSessionResponse
) {
  return {
    type: REALTIME_PROXY_CONNECT_EVENT_TYPE,
    model: session.model,
    clientSecret: session.clientSecret,
  };
}

export function shouldSendRealtimeWebsocketAudio(input: {
  microphoneEnabled: boolean;
  readyState: number;
}): boolean {
  return input.microphoneEnabled && input.readyState === WebSocket.OPEN;
}

export function extractRealtimeWebsocketAudioDelta(event: unknown): string {
  if (!event || typeof event !== 'object') return '';
  const type = (event as { type?: unknown }).type;
  if (
    type !== 'response.output_audio.delta' &&
    type !== 'response.audio.delta'
  ) {
    return '';
  }
  const delta = (event as { delta?: unknown }).delta;
  return typeof delta === 'string' ? delta : '';
}

export function extractRealtimeWebsocketErrorMessage(event: unknown): string {
  if (!event || typeof event !== 'object') return '';
  const type = (event as { type?: unknown }).type;
  if (type !== 'error') return '';

  const error = (event as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) return code;
  }

  return 'Realtime WebSocket error';
}

function isRealtimeProxyConnectedEvent(event: unknown): boolean {
  return (
    Boolean(event) &&
    typeof event === 'object' &&
    (event as { type?: unknown }).type === REALTIME_PROXY_CONNECTED_EVENT_TYPE
  );
}

function parseRealtimeWebsocketMessage(data: unknown): unknown {
  return JSON.parse(String(data));
}

export function computeRealtimeFloat32Volume(data: Float32Array): number {
  if (data.length < 1) return 0;

  let sum = 0;
  for (let index = 0; index < data.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, data[index] ?? 0));
    sum += sample * sample;
  }

  return Math.round(Math.sqrt(sum / data.length) * 100);
}

export function resampleFloat32Audio(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (input.length < 1) return new Float32Array();
  if (inputSampleRate === outputSampleRate) return input;

  const outputLength = Math.max(
    1,
    Math.round((input.length * outputSampleRate) / inputSampleRate)
  );
  const output = new Float32Array(outputLength);
  if (outputLength === 1) {
    output[0] = input[0] ?? 0;
    return output;
  }

  const scale = inputSampleRate / outputSampleRate;
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * scale;
    const lowerIndex = Math.floor(sourceIndex);
    const upperIndex = Math.min(input.length - 1, lowerIndex + 1);
    const weight = sourceIndex - lowerIndex;
    const lower = input[lowerIndex] ?? 0;
    const upper = input[upperIndex] ?? lower;
    output[index] = lower + (upper - lower) * weight;
  }

  return output;
}

export function float32ToPcm16Bytes(input: Float32Array): Uint8Array {
  const output = new Uint8Array(input.length * 2);
  const view = new DataView(output.buffer);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(index * 2, Math.round(pcm), true);
  }

  return output;
}

export function pcm16BytesToFloat32(input: Uint8Array): Float32Array {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const output = new Float32Array(Math.floor(input.byteLength / 2));

  for (let index = 0; index < output.length; index += 1) {
    output[index] = view.getInt16(index * 2, true) / 0x8000;
  }

  return output;
}

export function bytesToBase64(input: Uint8Array): string {
  const bufferCtor = (globalThis as unknown as { Buffer?: any }).Buffer;
  if (bufferCtor) return bufferCtor.from(input).toString('base64');

  let binary = '';
  for (let index = 0; index < input.length; index += 1) {
    binary += String.fromCharCode(input[index] ?? 0);
  }
  return btoa(binary);
}

export function base64ToUint8Array(input: string): Uint8Array {
  const bufferCtor = (globalThis as unknown as { Buffer?: any }).Buffer;
  if (bufferCtor) return new Uint8Array(bufferCtor.from(input, 'base64'));

  const binary = atob(input);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

async function resumeRealtimeAudioContext(
  audioContext: AudioContext,
  options: RealtimeVoiceClientOptions
) {
  if (audioContext.state !== 'suspended') return;
  try {
    await audioContext.resume();
  } catch (error) {
    options.onPlaybackBlocked?.(error);
    throw error;
  }
}

function waitForRealtimeWebsocketOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      ws.removeEventListener('open', handleOpen);
      ws.removeEventListener('error', handleError);
      ws.removeEventListener('close', handleClose);
    };
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleError = (event: Event) => {
      cleanup();
      reject(event);
    };
    const handleClose = (event: CloseEvent) => {
      cleanup();
      reject(
        new Error(
          `Realtime WebSocket closed before open: ${event.code || 'unknown'}`
        )
      );
    };
    ws.addEventListener('open', handleOpen);
    ws.addEventListener('error', handleError);
    ws.addEventListener('close', handleClose);
  });
}

function waitForRealtimeProxyConnected(
  ws: WebSocket,
  options: {
    onRejectReady: (reject: (error: Error) => void) => void;
  }
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    options.onRejectReady(reject);
    const cleanup = () => {
      ws.removeEventListener('message', handleMessage);
      ws.removeEventListener('error', handleError);
      ws.removeEventListener('close', handleClose);
    };
    const handleMessage = (event: MessageEvent) => {
      const payload = parseRealtimeWebsocketMessage(event.data);
      if (!isRealtimeProxyConnectedEvent(payload)) return;
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Realtime WebSocket proxy connection failed'));
    };
    const handleClose = (event: CloseEvent) => {
      cleanup();
      reject(
        new Error(
          `Realtime WebSocket proxy closed before ready: ${
            event.code || 'unknown'
          }`
        )
      );
    };
    ws.addEventListener('message', handleMessage);
    ws.addEventListener('error', handleError);
    ws.addEventListener('close', handleClose);
  });
}

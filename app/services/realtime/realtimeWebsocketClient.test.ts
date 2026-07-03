import { describe, expect, it } from 'vitest';
import type { RealtimeSessionResponse } from '@/shared/dto';
import {
  base64ToUint8Array,
  buildRealtimeProxyConnectEvent,
  buildRealtimeProxyWebsocketUrl,
  bytesToBase64,
  computeRealtimeFloat32Volume,
  extractRealtimeWebsocketAudioDelta,
  extractRealtimeWebsocketErrorMessage,
  isBenignRealtimeErrorEvent,
  float32ToPcm16Bytes,
  pcm16BytesToFloat32,
  resampleFloat32Audio,
  shouldSendRealtimeWebsocketAudio,
} from './realtimeWebsocketClient';

describe('realtimeWebsocketClient helpers', () => {
  const realtimeSession: RealtimeSessionResponse = {
    realtimeSessionId: 'rt_1',
    clientSecret: 'secret',
    expiresAt: null,
    model: 'gpt-realtime',
    voice: 'marin',
    maxDurationSeconds: 60,
    idleTimeoutSeconds: 30,
    remainingSeconds: 60,
    realtimeLimits: {
      warningAtMinutes: 3,
      softLimitMinutes: 4,
      hardLimitMinutes: 5,
    },
  };

  it('converts Float32 audio samples to little-endian PCM16 bytes', () => {
    expect(float32ToPcm16Bytes(new Float32Array([-1, 0, 1]))).toEqual(
      new Uint8Array([0, 128, 0, 0, 255, 127])
    );
  });

  it('decodes PCM16 bytes back to Float32 samples', () => {
    expect(
      Array.from(pcm16BytesToFloat32(new Uint8Array([0, 128, 0, 0, 255, 127])))
    ).toEqual([-1, 0, 32767 / 32768]);
  });

  it('round trips base64 audio chunks', () => {
    const bytes = new Uint8Array([0, 128, 255, 64]);

    expect(base64ToUint8Array(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('resamples Float32 audio to the target sample rate', () => {
    const output = resampleFloat32Audio(
      new Float32Array([0, 0.5, 1, 0.5]),
      48_000,
      24_000
    );

    expect(output).toHaveLength(2);
    expect(output[0]).toBeCloseTo(0);
    expect(output[1]).toBeCloseTo(1);
  });

  it('computes speech-like volume from Float32 audio frames', () => {
    expect(computeRealtimeFloat32Volume(new Float32Array([0, 0, 0]))).toBe(0);
    expect(
      computeRealtimeFloat32Volume(new Float32Array([-1, 1, -1, 1]))
    ).toBeGreaterThan(90);
  });

  it('extracts Realtime output audio deltas from supported event names', () => {
    expect(
      extractRealtimeWebsocketAudioDelta({
        type: 'response.output_audio.delta',
        delta: 'abc',
      })
    ).toBe('abc');
    expect(
      extractRealtimeWebsocketAudioDelta({
        type: 'response.audio.delta',
        delta: 'def',
      })
    ).toBe('def');
    expect(
      extractRealtimeWebsocketAudioDelta({
        type: 'response.output_audio_transcript.delta',
        delta: 'text',
      })
    ).toBe('');
  });

  it('sends microphone chunks only when the socket is open and mic is enabled', () => {
    expect(
      shouldSendRealtimeWebsocketAudio({
        microphoneEnabled: true,
        readyState: WebSocket.OPEN,
      })
    ).toBe(true);
    expect(
      shouldSendRealtimeWebsocketAudio({
        microphoneEnabled: false,
        readyState: WebSocket.OPEN,
      })
    ).toBe(false);
    expect(
      shouldSendRealtimeWebsocketAudio({
        microphoneEnabled: true,
        readyState: WebSocket.CONNECTING,
      })
    ).toBe(false);
  });

  it('connects Firefox browser clients to the local realtime proxy', () => {
    expect(
      buildRealtimeProxyWebsocketUrl({
        protocol: 'http:',
        host: 'localhost:3000',
      })
    ).toBe('ws://localhost:3000/api/realtime/openai-websocket');
    expect(
      buildRealtimeProxyWebsocketUrl({
        protocol: 'https:',
        host: 'glasno.test',
      })
    ).toBe('wss://glasno.test/api/realtime/openai-websocket');
  });

  it('builds the proxy init event from the ephemeral realtime session', () => {
    expect(buildRealtimeProxyConnectEvent(realtimeSession)).toEqual({
      type: 'glasno.realtime_proxy.connect',
      model: 'gpt-realtime',
      clientSecret: 'secret',
    });
  });

  it('extracts server-side Realtime WebSocket error messages', () => {
    expect(
      extractRealtimeWebsocketErrorMessage({
        type: 'error',
        error: { message: 'Invalid subprotocol' },
      })
    ).toBe('Invalid subprotocol');
    expect(extractRealtimeWebsocketErrorMessage({ type: 'session.created' }))
      .toBe('');
  });

  it('treats response cancellation races as benign errors', () => {
    expect(
      isBenignRealtimeErrorEvent({
        type: 'error',
        error: {
          code: 'response_cancel_not_active',
          message: 'Cancellation failed: no active response found',
        },
      })
    ).toBe(true);
    expect(
      isBenignRealtimeErrorEvent({
        type: 'error',
        error: { message: 'Invalid subprotocol' },
      })
    ).toBe(false);
    expect(isBenignRealtimeErrorEvent({ type: 'session.created' })).toBe(false);
  });
});

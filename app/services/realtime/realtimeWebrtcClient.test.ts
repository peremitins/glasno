import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as realtimeWebrtcClientModule from './realtimeWebrtcClient';
import {
  buildRealtimeAudioConstraints,
  computeRealtimeInputVolume,
  createRealtimePlaybackAudioRoute,
  shouldNotifyRealtimeInputActivity,
  waitForRealtimeIceGatheringComplete,
} from './realtimeWebrtcClient';

const source = readFileSync('app/services/realtime/realtimeWebrtcClient.ts', 'utf8');

describe('realtimeWebrtcClient helpers', () => {
  it('routes Android remote audio through a playback Web Audio context', () => {
    const shouldUsePlaybackRoute = (
      realtimeWebrtcClientModule as typeof realtimeWebrtcClientModule & {
        shouldUseRealtimePlaybackAudioRoute?: (userAgent: string) => boolean;
      }
    ).shouldUseRealtimePlaybackAudioRoute;

    expect(shouldUsePlaybackRoute).toBeTypeOf('function');
    if (!shouldUsePlaybackRoute) return;

    expect(
      shouldUsePlaybackRoute(
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36'
      )
    ).toBe(true);
    expect(
      shouldUsePlaybackRoute(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'
      )
    ).toBe(false);

  });

  it('keeps the WebRTC element as a muted kick and restores it on teardown', async () => {
    const stateChange = { listener: null as (() => void) | null };
    const destination = {} as AudioDestinationNode;
    const sourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const context: {
      state: AudioContextState;
      destination: AudioDestinationNode;
      createMediaStreamSource: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
    } = {
      state: 'suspended',
      destination,
      createMediaStreamSource: vi.fn(() => sourceNode),
      resume: vi.fn(async () => {
        context.state = 'running';
      }),
      close: vi.fn(async () => {}),
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        stateChange.listener = listener;
      }),
      removeEventListener: vi.fn(),
    };
    const AudioContextCtor = vi.fn(function createAudioContext() {
      return context;
    });
    const remoteAudio = { muted: false };
    const stream = {} as MediaStream;

    const route = createRealtimePlaybackAudioRoute({
      stream,
      remoteAudio: remoteAudio as HTMLAudioElement,
      AudioContextCtor: AudioContextCtor as unknown as typeof AudioContext,
    });
    expect(route).not.toBeNull();
    expect(await route?.ready).toBe(true);

    expect(AudioContextCtor).toHaveBeenCalledWith({ latencyHint: 'playback' });
    expect(context.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(sourceNode.connect).toHaveBeenCalledWith(destination);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(remoteAudio.muted).toBe(true);

    context.state = 'suspended';
    stateChange.listener?.();
    expect(remoteAudio.muted).toBe(false);

    context.state = 'running';
    stateChange.listener?.();
    expect(remoteAudio.muted).toBe(true);

    route?.stop();
    expect(remoteAudio.muted).toBe(false);
    expect(sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(context.removeEventListener).toHaveBeenCalledWith(
      'statechange',
      stateChange.listener
    );
  });

  it('can tear down a playback route while AudioContext.resume is pending', async () => {
    const pendingResume = { finish: null as (() => void) | null };
    const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
    const context = {
      state: 'suspended' as AudioContextState,
      destination: {} as AudioDestinationNode,
      createMediaStreamSource: vi.fn(() => sourceNode),
      resume: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            pendingResume.finish = resolve;
          })
      ),
      close: vi.fn(async () => {}),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const AudioContextCtor = vi.fn(function createAudioContext() {
      return context;
    });
    const remoteAudio = { muted: false };

    const route = createRealtimePlaybackAudioRoute({
      stream: {} as MediaStream,
      remoteAudio: remoteAudio as HTMLAudioElement,
      AudioContextCtor: AudioContextCtor as unknown as typeof AudioContext,
    });
    route?.stop();

    expect(context.close).toHaveBeenCalledOnce();
    expect(sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(remoteAudio.muted).toBe(false);

    pendingResume.finish?.();
    expect(await route?.ready).toBe(false);
  });

  it('requests browser audio processing for realtime microphone capture', () => {
    expect(buildRealtimeAudioConstraints()).toMatchObject({
      audio: {
        channelCount: { ideal: 1 },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
      },
    });
  });

  it('computes silence and speech-like input volume from analyser frames', () => {
    expect(computeRealtimeInputVolume(new Uint8Array([128, 128, 128]))).toBe(
      0
    );
    expect(
      computeRealtimeInputVolume(new Uint8Array([0, 255, 0, 255]))
    ).toBeGreaterThan(90);
  });

  it('throttles microphone activity notifications', () => {
    expect(
      shouldNotifyRealtimeInputActivity({
        volume: 8,
        now: 2_000,
        lastInputActivityAtMs: 0,
      })
    ).toBe(true);
    expect(
      shouldNotifyRealtimeInputActivity({
        volume: 8,
        now: 2_500,
        lastInputActivityAtMs: 2_000,
      })
    ).toBe(false);
    expect(
      shouldNotifyRealtimeInputActivity({
        volume: 1,
        now: 4_000,
        lastInputActivityAtMs: 0,
      })
    ).toBe(false);
  });

  it('does not treat continuous MediaStream time updates as assistant speech', () => {
    expect(source).not.toContain(
      "remoteAudio.addEventListener('timeupdate', notifyRemoteAudioActivity)"
    );
  });

  it('waits for ICE gathering to complete before handshake', async () => {
    const addEventListener = vi.fn<(event: string, cb: () => void) => void>();
    const connection = {
      iceGatheringState: 'new',
      addEventListener,
      removeEventListener: vi.fn(),
    } as unknown as RTCPeerConnection;

    const completed = waitForRealtimeIceGatheringComplete(connection, 10_000);
    (
      connection as unknown as { iceGatheringState: RTCIceGatheringState }
    ).iceGatheringState = 'complete';
    // Колбэк берём из мока: присваивание в замыкании TS-flow не отслеживает.
    const listener = addEventListener.mock.calls[0]?.[1];
    listener?.();
    await completed;

    expect(connection.removeEventListener).toHaveBeenCalledWith(
      'icegatheringstatechange',
      expect.any(Function)
    );
  });
});

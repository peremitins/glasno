import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  buildRealtimeAudioConstraints,
  computeRealtimeInputVolume,
  shouldNotifyRealtimeInputActivity,
  waitForRealtimeIceGatheringComplete,
} from './realtimeWebrtcClient';

const source = readFileSync('app/services/realtime/realtimeWebrtcClient.ts', 'utf8');

describe('realtimeWebrtcClient helpers', () => {
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

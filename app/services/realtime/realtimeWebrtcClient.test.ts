import { describe, expect, it, vi } from 'vitest';
import {
  buildRealtimeAudioConstraints,
  computeRealtimeInputVolume,
  shouldNotifyRealtimeInputActivity,
  shouldNotifyRemoteAudioPlaybackActivity,
  waitForRealtimeIceGatheringComplete,
} from './realtimeWebrtcClient';

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

  it('throttles remote audio playback activity notifications', () => {
    expect(
      shouldNotifyRemoteAudioPlaybackActivity({
        now: 1_000,
        lastRemoteAudioActivityAtMs: 0,
      })
    ).toBe(true);
    expect(
      shouldNotifyRemoteAudioPlaybackActivity({
        now: 2_000,
        lastRemoteAudioActivityAtMs: 1_000,
      })
    ).toBe(false);
    expect(
      shouldNotifyRemoteAudioPlaybackActivity({
        now: 6_000,
        lastRemoteAudioActivityAtMs: 1_000,
      })
    ).toBe(true);
  });

  it('waits for ICE gathering to complete before handshake', async () => {
    let listener: (() => void) | null = null;
    const connection = {
      iceGatheringState: 'new',
      addEventListener: vi.fn((_event: string, callback: () => void) => {
        listener = callback;
      }),
      removeEventListener: vi.fn(),
    } as unknown as RTCPeerConnection;

    const completed = waitForRealtimeIceGatheringComplete(connection, 10_000);
    (
      connection as unknown as { iceGatheringState: RTCIceGatheringState }
    ).iceGatheringState = 'complete';
    listener?.();
    await completed;

    expect(connection.removeEventListener).toHaveBeenCalledWith(
      'icegatheringstatechange',
      expect.any(Function)
    );
  });
});

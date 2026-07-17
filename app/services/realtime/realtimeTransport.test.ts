import { describe, expect, it } from 'vitest';
import * as realtimeTransportModule from './realtimeTransport';
import { shouldUseRealtimeWebsocketTransport } from './realtimeTransport';

describe('realtimeTransport', () => {
  it('keeps the browser audio session in play-and-record until realtime stops', () => {
    const activateAudioSession = (
      realtimeTransportModule as typeof realtimeTransportModule & {
        activateRealtimeAudioSession?: (target: unknown) => () => void;
      }
    ).activateRealtimeAudioSession;
    const audioSession = { type: 'auto' };

    expect(activateAudioSession).toBeTypeOf('function');
    if (!activateAudioSession) return;

    const restore = activateAudioSession({ audioSession });
    expect(audioSession.type).toBe('play-and-record');

    restore();
    expect(audioSession.type).toBe('auto');
  });

  it('does not overwrite an audio-session change made by another feature', () => {
    const activateAudioSession = (
      realtimeTransportModule as typeof realtimeTransportModule & {
        activateRealtimeAudioSession?: (target: unknown) => () => void;
      }
    ).activateRealtimeAudioSession;
    const audioSession = { type: 'playback' };

    expect(activateAudioSession).toBeTypeOf('function');
    if (!activateAudioSession) return;

    const restore = activateAudioSession({ audioSession });
    audioSession.type = 'transient';
    restore();

    expect(audioSession.type).toBe('transient');
  });

  it('uses WebSocket transport in Firefox to avoid Realtime WebRTC media drops', () => {
    expect(
      shouldUseRealtimeWebsocketTransport(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0'
      )
    ).toBe(true);
  });

  it('keeps WebRTC transport in Chromium and Safari', () => {
    expect(
      shouldUseRealtimeWebsocketTransport(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      )
    ).toBe(false);
    expect(
      shouldUseRealtimeWebsocketTransport(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
      )
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { shouldUseRealtimeWebsocketTransport } from './realtimeTransport';

describe('realtimeTransport', () => {
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

import { describe, expect, it } from 'vitest';
import {
  buildOpenAiRealtimeWebsocketUrl,
  buildRealtimeProxyErrorEvent,
  parseRealtimeProxyConnectMessage,
} from './realtimeWebsocketProxy';

describe('realtimeWebsocketProxy', () => {
  it('builds the OpenAI server-to-server WebSocket URL', () => {
    expect(buildOpenAiRealtimeWebsocketUrl('gpt realtime')).toBe(
      'wss://api.openai.com/v1/realtime?model=gpt%20realtime'
    );
  });

  it('parses the client proxy connect message', () => {
    expect(
      parseRealtimeProxyConnectMessage(
        JSON.stringify({
          type: 'jobai.realtime_proxy.connect',
          model: 'gpt-realtime',
          clientSecret: 'secret',
        })
      )
    ).toEqual({
      model: 'gpt-realtime',
      clientSecret: 'secret',
    });
  });

  it('rejects malformed proxy connect messages', () => {
    expect(parseRealtimeProxyConnectMessage('{"type":"other"}')).toBeNull();
    expect(
      parseRealtimeProxyConnectMessage(
        JSON.stringify({
          type: 'jobai.realtime_proxy.connect',
          model: '',
          clientSecret: 'secret',
        })
      )
    ).toBeNull();
  });

  it('formats proxy errors as Realtime error events', () => {
    expect(buildRealtimeProxyErrorEvent('Connection failed')).toEqual({
      type: 'error',
      error: {
        message: 'Connection failed',
      },
    });
  });
});

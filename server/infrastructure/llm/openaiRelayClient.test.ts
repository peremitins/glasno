import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRelayRequest,
  isRelayEnabled,
  sendOpenAiRealtimeCallRequest,
  sendOpenAiResponsesRequest,
} from './openaiResponsesClient';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('ofetch', () => ({
  $fetch: fetchMock,
}));

describe('openai responses relay client', () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  it('enables relay explicitly or when relay url is configured', () => {
    expect(isRelayEnabled({ AI_USE_RELAY: 'true' })).toBe(true);
    expect(
      isRelayEnabled({
        AI_USE_RELAY: 'false',
        AI_RELAY_URL: 'https://relay.example.com',
      })
    ).toBe(false);
    expect(isRelayEnabled({ AI_RELAY_URL: 'https://relay.example.com' })).toBe(
      true
    );
    expect(isRelayEnabled({})).toBe(false);
  });

  it('builds signed relay requests without provider authorization headers', () => {
    const request = buildRelayRequest({
      path: '/v1/responses',
      purpose: 'report',
      body: { model: 'gpt-test', input: [] },
      env: {
        AI_RELAY_URL: 'https://relay.example.com/',
        AI_RELAY_AUTH_SECRET: 'secret',
        AI_RELAY_CLIENT_ID: 'glasno-test',
      },
      requestId: 'request_1',
      timestamp: '1700000000000',
      nonce: 'nonce_1',
    });

    expect(request.url).toBe('https://relay.example.com/v1/responses');
    expect(request.headers).toMatchObject({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Relay-Client': 'glasno-test',
      'X-Relay-Timestamp': '1700000000000',
      'X-Relay-Nonce': 'nonce_1',
      'X-Purpose': 'report',
      'X-Request-Id': 'request_1',
    });
    expect(request.headers).not.toHaveProperty('Authorization');
    expect(request.headers['X-Relay-Signature']).toEqual(expect.any(String));
  });

  it('uses relay for Responses API when relay is enabled', async () => {
    fetchMock.mockResolvedValueOnce({ id: 'resp_1', output: [] });

    await sendOpenAiResponsesRequest({
      body: { model: 'gpt-test', input: [] },
      purpose: 'report',
      apiKey: 'sk-direct-key',
      env: {
        AI_USE_RELAY: 'true',
        AI_RELAY_URL: 'https://relay.example.com',
        AI_RELAY_AUTH_SECRET: 'secret',
        AI_RELAY_CLIENT_ID: 'glasno-test',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Relay-Client': 'glasno-test',
        }),
      })
    );
    const request = fetchMock.mock.calls[0]?.[1] as { headers?: object };
    expect(request.headers).not.toHaveProperty('Authorization');
  });

  it('sends {sdp, session} to the relay realtime/calls route when relay is enabled', async () => {
    fetchMock.mockResolvedValueOnce('v=0\r\no=- answer-sdp\r\n');

    const answerSdp = await sendOpenAiRealtimeCallRequest({
      sdp: 'v=0\r\no=- offer-sdp\r\n',
      session: { type: 'realtime', model: 'gpt-realtime' },
      apiKey: 'sk-direct-key',
      env: {
        AI_USE_RELAY: 'true',
        AI_RELAY_URL: 'https://relay.example.com',
        AI_RELAY_AUTH_SECRET: 'secret',
        AI_RELAY_CLIENT_ID: 'glasno-test',
      },
    });

    expect(answerSdp).toBe('v=0\r\no=- answer-sdp\r\n');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example.com/v1/realtime/calls',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Relay-Client': 'glasno-test' }),
      })
    );
    const request = fetchMock.mock.calls[0]?.[1] as {
      headers?: object;
      body?: string;
    };
    expect(request.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(request.body))).toEqual({
      sdp: 'v=0\r\no=- offer-sdp\r\n',
      session: { type: 'realtime', model: 'gpt-realtime' },
    });
  });

  it('calls the realtime provider directly with a multipart form when relay is disabled', async () => {
    fetchMock.mockResolvedValueOnce('v=0\r\no=- answer-sdp\r\n');

    const answerSdp = await sendOpenAiRealtimeCallRequest({
      sdp: 'offer-sdp',
      session: { type: 'realtime', model: 'gpt-realtime' },
      apiKey: 'sk-direct-key',
      env: {},
    });

    expect(answerSdp).toBe('v=0\r\no=- answer-sdp\r\n');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/calls',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-direct-key',
        }),
      })
    );
    const request = fetchMock.mock.calls[0]?.[1] as { body?: FormData };
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.body?.get('sdp')).toBe('offer-sdp');
    expect(request.body?.get('session')).toBe(
      JSON.stringify({ type: 'realtime', model: 'gpt-realtime' })
    );
  });

  it('throws E_UPSTREAM without a provider brand name when the realtime call is not configured', async () => {
    await expect(
      sendOpenAiRealtimeCallRequest({
        sdp: 'offer-sdp',
        session: { type: 'realtime' },
        env: {},
      })
    ).rejects.toMatchObject({
      data: { code: 'E_UPSTREAM' },
    });
  });
});

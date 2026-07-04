import { describe, expect, it, vi } from 'vitest';
import {
  buildRelayRequest,
  isRelayEnabled,
  sendOpenAiResponsesRequest,
} from './openaiResponsesClient';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('ofetch', () => ({
  $fetch: fetchMock,
}));

describe('openai responses relay client', () => {
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
});

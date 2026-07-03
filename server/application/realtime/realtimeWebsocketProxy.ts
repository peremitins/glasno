export const REALTIME_PROXY_CONNECT_EVENT_TYPE =
  'glasno.realtime_proxy.connect';
export const REALTIME_PROXY_CONNECTED_EVENT_TYPE =
  'glasno.realtime_proxy.connected';

const OPENAI_REALTIME_WEBSOCKET_URL = 'wss://api.openai.com/v1/realtime';

export interface RealtimeProxyConnectMessage {
  model: string;
  clientSecret: string;
}

export function buildOpenAiRealtimeWebsocketUrl(model: string): string {
  return `${OPENAI_REALTIME_WEBSOCKET_URL}?model=${encodeURIComponent(model)}`;
}

export function parseRealtimeProxyConnectMessage(
  rawMessage: string
): RealtimeProxyConnectMessage | null {
  try {
    const payload = JSON.parse(rawMessage);
    if (!payload || typeof payload !== 'object') return null;
    if (
      (payload as { type?: unknown }).type !== REALTIME_PROXY_CONNECT_EVENT_TYPE
    ) {
      return null;
    }

    const model = normalizeString((payload as { model?: unknown }).model);
    const clientSecret = normalizeString(
      (payload as { clientSecret?: unknown }).clientSecret
    );
    if (!model || !clientSecret) return null;

    return { model, clientSecret };
  } catch {
    return null;
  }
}

export function buildRealtimeProxyConnectedEvent() {
  return {
    type: REALTIME_PROXY_CONNECTED_EVENT_TYPE,
  };
}

export function buildRealtimeProxyErrorEvent(message: string) {
  return {
    type: 'error',
    error: {
      message,
    },
  };
}

export function serializeRealtimeProxyEvent(event: unknown): string {
  return JSON.stringify(event);
}

export function normalizeRealtimeProxyError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Realtime WebSocket proxy error';
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

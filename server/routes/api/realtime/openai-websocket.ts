import WebSocket from 'ws';
import {
  buildOpenAiRealtimeWebsocketUrl,
  buildRealtimeProxyConnectedEvent,
  buildRealtimeProxyErrorEvent,
  normalizeRealtimeProxyError,
  parseRealtimeProxyConnectMessage,
  serializeRealtimeProxyEvent,
} from '@/server/application/realtime/realtimeWebsocketProxy';

type CrossWsPeer = {
  id?: string;
  send(data: unknown): unknown;
  close(code?: number, reason?: string): void;
};

type CrossWsMessage = {
  text(): string;
};

interface ProxyState {
  upstream: WebSocket | null;
  pendingMessages: string[];
  upstreamReady: boolean;
  closed: boolean;
}

const peerStates = new WeakMap<CrossWsPeer, ProxyState>();

export default defineWebSocketHandler({
  open(peer: CrossWsPeer) {
    peerStates.set(peer, {
      upstream: null,
      pendingMessages: [],
      upstreamReady: false,
      closed: false,
    });
  },

  message(peer: CrossWsPeer, message: CrossWsMessage) {
    const state = getProxyState(peer);
    const text = message.text();

    if (!state.upstream) {
      const connectMessage = parseRealtimeProxyConnectMessage(text);
      if (!connectMessage) {
        sendProxyError(peer, 'Realtime WebSocket proxy init message is invalid');
        closePeer(peer, 1008, 'invalid_proxy_init');
        return;
      }
      connectOpenAiRealtime(peer, state, connectMessage);
      return;
    }

    if (!state.upstreamReady) {
      state.pendingMessages.push(text);
      return;
    }

    state.upstream.send(text);
  },

  close(peer: CrossWsPeer) {
    closeProxyState(peer);
  },

  error(peer: CrossWsPeer, error: unknown) {
    sendProxyError(peer, normalizeRealtimeProxyError(error));
    closeProxyState(peer);
  },
});

function connectOpenAiRealtime(
  peer: CrossWsPeer,
  state: ProxyState,
  connectMessage: { model: string; clientSecret: string }
) {
  const upstream = new WebSocket(
    buildOpenAiRealtimeWebsocketUrl(connectMessage.model),
    {
      headers: {
        Authorization: `Bearer ${connectMessage.clientSecret}`,
      },
    }
  );
  state.upstream = upstream;

  upstream.on('open', () => {
    if (state.closed) return;
    state.upstreamReady = true;
    peer.send(serializeRealtimeProxyEvent(buildRealtimeProxyConnectedEvent()));
    for (const pendingMessage of state.pendingMessages.splice(0)) {
      upstream.send(pendingMessage);
    }
  });

  upstream.on('message', (data) => {
    if (state.closed) return;
    peer.send(data.toString());
  });

  upstream.on('error', (error) => {
    if (state.closed) return;
    sendProxyError(peer, normalizeRealtimeProxyError(error));
    closePeer(peer, 1011, 'upstream_error');
  });

  upstream.on('close', (code, reason) => {
    if (state.closed) return;
    const reasonText = reason.toString() || 'upstream_closed';
    closePeer(peer, code || 1011, reasonText);
  });
}

function getProxyState(peer: CrossWsPeer): ProxyState {
  const existing = peerStates.get(peer);
  if (existing) return existing;

  const nextState: ProxyState = {
    upstream: null,
    pendingMessages: [],
    upstreamReady: false,
    closed: false,
  };
  peerStates.set(peer, nextState);
  return nextState;
}

function sendProxyError(peer: CrossWsPeer, message: string) {
  try {
    peer.send(serializeRealtimeProxyEvent(buildRealtimeProxyErrorEvent(message)));
  } catch {
    // The client may already be gone.
  }
}

function closePeer(peer: CrossWsPeer, code: number, reason: string) {
  try {
    peer.close(code, reason);
  } catch {
    // The client may already be gone.
  } finally {
    closeProxyState(peer);
  }
}

function closeProxyState(peer: CrossWsPeer) {
  const state = peerStates.get(peer);
  if (!state) return;
  state.closed = true;
  if (state.upstream && state.upstream.readyState === WebSocket.OPEN) {
    state.upstream.close(1000, 'client_closed');
  }
  state.pendingMessages = [];
  peerStates.delete(peer);
}

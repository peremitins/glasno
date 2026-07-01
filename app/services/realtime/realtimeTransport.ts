import type { RealtimeSessionResponse } from '@/shared/dto';
import {
  startRealtimeWebrtcClient,
  type RealtimeVoiceClientOptions,
  type RealtimeWebrtcClient,
} from './realtimeWebrtcClient';
import { startRealtimeWebsocketClient } from './realtimeWebsocketClient';

export type RealtimeVoiceClient = RealtimeWebrtcClient;

export async function startRealtimeVoiceClient(
  session: RealtimeSessionResponse,
  options: RealtimeVoiceClientOptions = {}
): Promise<RealtimeVoiceClient> {
  if (shouldUseRealtimeWebsocketTransport()) {
    return startRealtimeWebsocketClient(session, options);
  }

  return startRealtimeWebrtcClient(session, options);
}

export function shouldUseRealtimeWebsocketTransport(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): boolean {
  return /Firefox\//i.test(userAgent) || /FxiOS/i.test(userAgent);
}

import type { RealtimeSessionResponse } from '@/shared/dto';
import {
  startRealtimeWebrtcClient,
  type RealtimeVoiceClientOptions,
  type RealtimeWebrtcClient,
} from './realtimeWebrtcClient';
import { startRealtimeWebsocketClient } from './realtimeWebsocketClient';

export type RealtimeVoiceClient = RealtimeWebrtcClient;

type RealtimeAudioSession = {
  type: string;
};

type RealtimeAudioSessionNavigator = {
  audioSession?: RealtimeAudioSession;
};

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

/**
 * Safari/WebKit умеет явно держать страницу в режиме двустороннего разговора.
 * Chromium Android пока не реализует Audio Session API, поэтому там функция
 * безопасно остаётся no-op, а output-маршрут настраивает WebRTC-клиент.
 */
export function activateRealtimeAudioSession(
  target: RealtimeAudioSessionNavigator | undefined =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & RealtimeAudioSessionNavigator)
      : undefined
): () => void {
  const audioSession = target?.audioSession;
  if (!audioSession) return () => {};

  const previousType = audioSession.type || 'auto';
  try {
    audioSession.type = 'play-and-record';
  } catch {
    return () => {};
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    try {
      // Не перетираем более свежее решение другого аудио-сценария страницы.
      if (audioSession.type === 'play-and-record') {
        audioSession.type = previousType;
      }
    } catch {
      // WebKit мог уничтожить audio session во время закрытия страницы.
    }
  };
}

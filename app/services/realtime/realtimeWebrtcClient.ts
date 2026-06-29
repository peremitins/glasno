import type { RealtimeSessionResponse } from '@/shared/dto';

export interface RealtimeWebrtcClient {
  stop(): void;
}

export async function startRealtimeWebrtcClient(
  session: RealtimeSessionResponse,
  options: {
    onEvent?: (event: unknown) => void;
    onError?: (error: unknown) => void;
    onActivity?: () => void;
  } = {}
): Promise<RealtimeWebrtcClient> {
  if (typeof window === 'undefined') {
    throw new Error('Realtime voice доступен только в браузере');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Браузер не поддерживает захват микрофона');
  }

  const peerConnection = new RTCPeerConnection();
  const remoteAudio = new Audio();
  remoteAudio.autoplay = true;
  const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  for (const track of mediaStream.getTracks()) {
    peerConnection.addTrack(track, mediaStream);
  }

  peerConnection.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0] ?? null;
  };

  peerConnection.onconnectionstatechange = () => {
    if (
      peerConnection.connectionState === 'failed' ||
      peerConnection.connectionState === 'disconnected'
    ) {
      options.onError?.(
        new Error(`Realtime connection ${peerConnection.connectionState}`)
      );
    }
    if (peerConnection.connectionState === 'connected') {
      options.onActivity?.();
    }
  };

  const dataChannel = peerConnection.createDataChannel('oai-events');
  dataChannel.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (isRealtimeActivityEvent(payload)) {
        options.onActivity?.();
      }
      options.onEvent?.(payload);
    } catch {
      options.onActivity?.();
      options.onEvent?.(event.data);
    }
  };
  dataChannel.onerror = (event) => options.onError?.(event);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  // GA Realtime API: SDP-обмен идёт на /v1/realtime/calls (beta /v1/realtime отключён).
  const sdpResponse = await fetch(
    `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(session.model)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.clientSecret}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    }
  );

  if (!sdpResponse.ok) {
    const detail = await sdpResponse.text().catch(() => '');
    throw new Error(
      `Realtime SDP failed: ${sdpResponse.status}${detail ? ` — ${detail}` : ''}`
    );
  }

  await peerConnection.setRemoteDescription({
    type: 'answer',
    sdp: await sdpResponse.text(),
  });

  function stop() {
    dataChannel.close();
    for (const sender of peerConnection.getSenders()) {
      sender.track?.stop();
    }
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    remoteAudio.pause();
    remoteAudio.srcObject = null;
    peerConnection.close();
  }

  return { stop };
}

function isRealtimeActivityEvent(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false;
  const type = (event as { type?: unknown }).type;
  if (typeof type !== 'string') return false;
  return (
    type === 'input_audio_buffer.speech_started' ||
    type === 'input_audio_buffer.speech_stopped' ||
    type.startsWith('conversation.item.input_audio_transcription.') ||
    type.startsWith('response.audio_transcript.') ||
    type === 'response.created' ||
    type === 'response.done'
  );
}

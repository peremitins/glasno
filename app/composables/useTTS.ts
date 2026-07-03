import { computed, ref } from 'vue';
import type { TtsFormat } from '@/shared/dto';
import { CSRF_COOKIE_NAME } from '@/shared/constants';
import { useAudioPermissionGate } from './useAudioPermissionGate';

interface TtsSpeakOptions {
  voice?: string;
  model?: string;
  format?: TtsFormat;
}

const currentAudio = ref<HTMLAudioElement | null>(null);
let currentAbortController: AbortController | null = null;
let currentBlobUrl: string | null = null;

const MIME_BY_FORMAT: Record<TtsFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/ogg',
};

function readClientCookie(name: string): string | null {
  if (!import.meta.client) return null;
  const prefix = `${name}=`;
  const raw = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return raw ? decodeURIComponent(raw.slice(prefix.length)) : null;
}

export function useTTS() {
  const audioPermissionGate = useAudioPermissionGate();
  const isPlaying = computed(() => Boolean(currentAudio.value));

  function cleanup() {
    if (currentAudio.value) {
      currentAudio.value.pause();
      currentAudio.value.onended = null;
      currentAudio.value.onerror = null;
      currentAudio.value = null;
    }
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
    currentAbortController = null;
  }

  function stop() {
    if (currentAbortController) {
      currentAbortController.abort();
    }
    cleanup();
  }

  // Озвучивает текст и резолвится ТОЛЬКО после окончания воспроизведения
  // (audio.onended), а не сразу после audio.play(). Это позволяет
  // выстраивать последовательную очередь реплик и держать корректное
  // состояние «интервьюер говорит» на всё время звучания.
  async function speak(text: string, options: TtsSpeakOptions = {}) {
    if (!text.trim()) return;
    stop();

    const abortController = new AbortController();
    currentAbortController = abortController;

    try {
      const format = options.format || 'mp3';
      const headers = new Headers({
        Accept: MIME_BY_FORMAT[format],
        'Content-Type': 'application/json',
      });
      const csrfToken = readClientCookie(CSRF_COOKIE_NAME);
      if (csrfToken) headers.set('x-csrf-token', csrfToken);

      const response = await fetch('/api/tts/openai', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          text,
          ...(options.voice ? { voice: options.voice } : {}),
          ...(options.model ? { model: options.model } : {}),
          format,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const responseBuffer = await response.arrayBuffer();
      if (abortController.signal.aborted) return;

      const blob = new Blob([new Uint8Array(responseBuffer)], {
        type: MIME_BY_FORMAT[format],
      });
      const blobUrl = URL.createObjectURL(blob);
      currentBlobUrl = blobUrl;
      const audio = new Audio(blobUrl);
      currentAudio.value = audio;

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };
        audio.onended = finish;
        audio.onerror = finish;
        // Прерывание текущей озвучки извне (stop) тоже завершает ожидание.
        abortController.signal.addEventListener('abort', finish, { once: true });
        audio.play().catch((error) => {
          audioPermissionGate.handlePlaybackFailure(error);
          finish();
        });
      });
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('[TTS] speak failed', error);
      }
      cleanup();
    }
  }

  return {
    isPlaying,
    speak,
    stop,
  };
}

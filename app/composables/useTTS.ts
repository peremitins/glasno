import { computed, ref } from 'vue';
import type { TtsFormat } from '@/shared/dto';

interface TtsSpeakOptions {
  voice?: string;
  model?: string;
  format?: TtsFormat;
}

const currentAudio = ref<HTMLAudioElement | null>(null);
let currentAbortController: AbortController | null = null;
let currentBlobUrl: string | null = null;

export function useTTS() {
  const api = useAPI();
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

  async function speak(text: string, options: TtsSpeakOptions = {}) {
    if (!text.trim()) return;
    stop();

    const abortController = new AbortController();
    currentAbortController = abortController;

    try {
      const response = await api<ArrayBuffer>('/api/tts/openai', {
        method: 'POST',
        body: {
          text,
          ...(options.voice ? { voice: options.voice } : {}),
          ...(options.model ? { model: options.model } : {}),
          format: options.format || 'mp3',
        },
        responseType: 'arrayBuffer',
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      const blob = new Blob([response], { type: 'audio/mpeg' });
      const blobUrl = URL.createObjectURL(blob);
      currentBlobUrl = blobUrl;
      const audio = new Audio(blobUrl);
      currentAudio.value = audio;

      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
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

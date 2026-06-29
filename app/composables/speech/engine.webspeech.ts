import type { SpeechEngine, SpeechEngineOptions } from './types';
import { useSpeechStore } from '@/app/stores/speech';

export function createWebSpeechEngine(): SpeechEngine {
  const speechStore = useSpeechStore();
  let finalCb: ((text: string) => void) | null = null;
  let partialCb: ((text: string) => void) | null = null;
  let errorCb: ((error: unknown) => void) | null = null;
  let recognition: any = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let silenceMs = 7000;
  let language = 'ru-RU';
  let continuousMode = false;
  let stopInFlight = false;
  let lastSpeechAtMs = 0;

  function isSupported() {
    if (typeof window === 'undefined') return false;
    const webWindow = window as any;
    return Boolean(webWindow.SpeechRecognition || webWindow.webkitSpeechRecognition);
  }

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function clearRestartTimer() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function resetSilenceTimer() {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      stop().catch(() => {});
    }, silenceMs);
  }

  function buildRecognition() {
    const webWindow = window as any;
    const SpeechRecognition =
      webWindow.SpeechRecognition || webWindow.webkitSpeechRecognition;
    const instance = new SpeechRecognition();
    instance.lang = language;
    instance.interimResults = true;
    instance.continuous = true;

    instance.onresult = (event: any) => {
      let newFinal = '';
      let latestInterim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript || '';
        if (result.isFinal) {
          newFinal += text;
        } else {
          latestInterim = text;
        }
      }

      const finalText = newFinal.trim();
      const interimText = latestInterim.trim();
      if (finalText || interimText) {
        lastSpeechAtMs = Date.now();
      }

      if (interimText) {
        partialCb?.(interimText);
        resetSilenceTimer();
      }
      if (finalText) {
        finalCb?.(finalText);
        if (continuousMode) {
          resetSilenceTimer();
        } else {
          stop().catch(() => {});
        }
      }
    };

    instance.onerror = (event: any) => {
      const errorType = event?.error;
      if (continuousMode && errorType === 'no-speech') return;
      if (errorType === 'aborted') return;
      errorCb?.(
        new Error(
          typeof errorType === 'string'
            ? `Web Speech error: ${errorType}`
            : 'Web Speech error'
        )
      );
      stop().catch(() => {});
    };

    instance.onend = () => {
      if (
        continuousMode &&
        speechStore.isListening &&
        !stopInFlight &&
        recognition === instance
      ) {
        const sinceSpeech = lastSpeechAtMs
          ? Date.now() - lastSpeechAtMs
          : Number.POSITIVE_INFINITY;
        const restartThreshold = Math.min(silenceMs - 1000, 4000);
        if (sinceSpeech > restartThreshold) {
          stop().catch(() => {});
          return;
        }
        restartFresh();
        return;
      }

      if (!stopInFlight) {
        stop().catch(() => {});
      }
    };

    return instance;
  }

  function restartFresh() {
    clearRestartTimer();
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!speechStore.isListening || stopInFlight) return;
      try {
        if (recognition) {
          recognition.onresult = null;
          recognition.onerror = null;
          recognition.onend = null;
          recognition.abort?.();
        }
        recognition = buildRecognition();
        recognition.start();
      } catch (error) {
        console.warn('[webspeech] restart failed', error);
        stop().catch(() => {});
      }
    }, 50);
  }

  async function start(options?: SpeechEngineOptions) {
    if (!isSupported()) throw new Error('Web Speech API is not available');
    if (speechStore.isListening) return;

    language = options?.language || language;
    silenceMs = options?.silenceMs ?? silenceMs;
    continuousMode = options?.continuousMode ?? false;
    stopInFlight = false;
    lastSpeechAtMs = 0;
    clearRestartTimer();

    recognition = buildRecognition();
    speechStore.setListening(true);
    recognition.start();
    resetSilenceTimer();
  }

  async function stop() {
    if (!speechStore.isListening) return;
    stopInFlight = true;
    speechStore.setListening(false);
    clearSilenceTimer();
    clearRestartTimer();

    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // Browser already stopped recognition.
      }
    }
  }

  return {
    start,
    stop,
    onPartial(cb) {
      partialCb = cb;
    },
    onFinal(cb) {
      finalCb = cb;
    },
    onError(cb) {
      errorCb = cb;
    },
    isAvailable() {
      return isSupported();
    },
  };
}

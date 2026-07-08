import { onMounted, watch } from 'vue';

// Настраиваемая пауза «окна тишины» перед ответом интервьюера в realtime-режиме
// (см. RealtimeResponseScheduler). Кандидат может делать естественные паузы в
// пределах этого окна — модель не перебьёт и не засчитает ответ преждевременно.

const STORAGE_KEY = 'glasno:realtime-response-pause-ms';

export const RESPONSE_PAUSE_OPTIONS_MS = [500, 1000, 2000, 3000, 5000] as const;
export const DEFAULT_RESPONSE_PAUSE_MS = 1000;

const MIN_PAUSE_MS = 500;
const MAX_PAUSE_MS = 5000;

function clampPauseMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_RESPONSE_PAUSE_MS;
  return Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, Math.round(ms)));
}

export function useRealtimeVoiceSettings() {
  const responsePauseMs = useState<number>(
    'glasno-realtime-response-pause-ms',
    () => DEFAULT_RESPONSE_PAUSE_MS
  );

  function setResponsePauseMs(ms: number) {
    responsePauseMs.value = clampPauseMs(ms);
  }

  onMounted(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const parsed = Number.parseInt(saved, 10);
      if (Number.isFinite(parsed)) {
        responsePauseMs.value = clampPauseMs(parsed);
      }
    }
    watch(
      responsePauseMs,
      (value) => {
        window.localStorage.setItem(STORAGE_KEY, String(value));
      },
      { immediate: true }
    );
  });

  return {
    responsePauseMs,
    setResponsePauseMs,
    responsePauseOptionsMs: RESPONSE_PAUSE_OPTIONS_MS,
  };
}

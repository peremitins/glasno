import { computed, watch } from 'vue';
import type { SpeechEngine, SpeechEngineId } from './speech/types';
import { useSpeechStore } from '@/app/stores/speech';

let engineSingleton: SpeechEngine | null = null;
let currentEngineId: SpeechEngineId | null = null;
const partialListeners = new Set<(text: string) => void>();
const finalListeners = new Set<(text: string) => void>();
const errorListeners = new Set<(error: unknown) => void>();

function dispatchPartial(text: string) {
  for (const listener of [...partialListeners]) listener(text);
}

function dispatchFinal(text: string) {
  for (const listener of [...finalListeners]) listener(text);
}

function dispatchError(error: unknown) {
  for (const listener of [...errorListeners]) listener(error);
}

function bindEngineDispatchers(engine: SpeechEngine) {
  engine.onPartial(dispatchPartial);
  engine.onFinal(dispatchFinal);
  engine.onError(dispatchError);
}

function resolveEngineId(id: SpeechEngineId): SpeechEngineId {
  return id === 'auto' ? 'webspeech' : id;
}

export function useSpeechEngine() {
  const speech = useSpeechStore();
  const settings = computed(() => ({
    engine: speech.engine,
    autoSend: speech.autoSend,
    language: speech.language,
    silenceMs: speech.silenceMs,
  }));

  async function pickEngine(id: SpeechEngineId): Promise<SpeechEngine> {
    const target = resolveEngineId(id);
    if (target === 'whisper') {
      throw new Error('Whisper в JobAI отключён');
    }

    const { createWebSpeechEngine } = await import(
      '@/app/composables/speech/engine.webspeech'
    );
    const engine = createWebSpeechEngine();
    if (!engine.isAvailable()) {
      throw new Error('Web Speech API недоступен в этом браузере');
    }
    return engine;
  }

  async function createAndBindEngine(id: SpeechEngineId) {
    const engine = await pickEngine(id);
    bindEngineDispatchers(engine);
    engineSingleton = engine;
    currentEngineId = resolveEngineId(id);
    return engine;
  }

  async function ensureEngine() {
    const targetEngineId = resolveEngineId(settings.value.engine);
    if (!engineSingleton || currentEngineId !== targetEngineId) {
      if (engineSingleton) await engineSingleton.stop().catch(() => {});
      await createAndBindEngine(targetEngineId);
    }
  }

  async function start(options?: { continuousMode?: boolean }) {
    await ensureEngine();
    await engineSingleton!.start({
      language: settings.value.language,
      silenceMs: settings.value.silenceMs,
      continuousMode: options?.continuousMode,
    });
  }

  async function stop() {
    if (!engineSingleton) return;
    await engineSingleton.stop().catch((error) => {
      console.error('[useSpeechEngine] stop failed', error);
    });
  }

  function onPartial(listener: (text: string) => void) {
    partialListeners.add(listener);
    return () => partialListeners.delete(listener);
  }

  function onFinal(listener: (text: string) => void) {
    finalListeners.add(listener);
    return () => finalListeners.delete(listener);
  }

  function onError(listener: (error: unknown) => void) {
    errorListeners.add(listener);
    return () => errorListeners.delete(listener);
  }

  async function setEngine(id: SpeechEngineId) {
    if (id === 'whisper') {
      speech.setEngine('webspeech');
      return;
    }

    const target = resolveEngineId(id);
    if (speech.engine === target && engineSingleton && currentEngineId === target) {
      return;
    }

    speech.setEngine(target);
    const wasActive = speech.isListening;
    if (engineSingleton) await engineSingleton.stop().catch(() => {});
    await createAndBindEngine(target);
    if (wasActive) {
      await engineSingleton!.start({
        language: settings.value.language,
        silenceMs: settings.value.silenceMs,
      });
    }
  }

  function setAutoSend(value: boolean) {
    speech.setAutoSend(value);
  }

  watch(
    () => speech.engine,
    async (next) => {
      if (next && resolveEngineId(next) !== currentEngineId) {
        await setEngine(next);
      }
    }
  );

  return {
    settings,
    start,
    stop,
    onPartial,
    onFinal,
    onError,
    setEngine,
    setAutoSend,
  };
}

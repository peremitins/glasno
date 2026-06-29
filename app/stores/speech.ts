import { defineStore } from 'pinia';
import type { SpeechEngineId } from '@/app/composables/speech/types';

export const useSpeechStore = defineStore('speech', {
  state: () => {
    const config = useRuntimeConfig();
    return {
      engine:
        ((config.public.speechDefaultEngine as SpeechEngineId) || 'webspeech'),
      autoSend: false,
      language: 'ru-RU',
      silenceMs: 7000,
      isListening: false,
    };
  },
  actions: {
    setEngine(engine: SpeechEngineId) {
      this.engine = engine;
    },
    setAutoSend(value: boolean) {
      this.autoSend = value;
    },
    setLanguage(language: string) {
      this.language = language;
    },
    setSilenceMs(ms: number) {
      this.silenceMs = ms;
    },
    setListening(value: boolean) {
      this.isListening = value;
    },
  },
});

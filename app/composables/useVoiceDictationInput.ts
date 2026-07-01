import type { Ref } from 'vue';
import { computed, onUnmounted, ref } from 'vue';
import { appendFinalDictationTranscript } from './speech/dictationMerge';
import { useMicPermissionGate } from './useMicPermissionGate';
import { useSpeechEngine } from './useSpeechEngine';
import { useTTS } from './useTTS';
import { useSpeechStore } from '@/app/stores/speech';

interface UseVoiceDictationInputOptions {
  value: Ref<string>;
}

let activeSessionId: symbol | null = null;

export function useVoiceDictationInput(options: UseVoiceDictationInputOptions) {
  const speechStore = useSpeechStore();
  const speechEngine = useSpeechEngine();
  const micPermissionGate = useMicPermissionGate();
  const tts = useTTS();
  const sessionId = Symbol('voice-dictation');

  const partialText = ref('');
  const errorMessage = ref('');
  const sessionTranscript = ref('');
  const startedText = ref('');
  // Стабильная база без текущей промежуточной фразы. Финалы коммитятся сюда,
  // а промежуточный текст лишь временно дописывается поверх в поле ввода.
  const committedText = ref('');

  const isListening = computed(
    () => speechStore.isListening && activeSessionId === sessionId
  );

  // Промежуточный (ещё не финальный) текст пишем сразу в поле — без отдельного
  // блока под кнопкой. Пользователь видит распознавание в реальном времени.
  const removePartial = speechEngine.onPartial((text) => {
    if (activeSessionId !== sessionId) return;
    // Пока интервьюер озвучивается через динамики, микрофон ловит его голос.
    // Не пишем это эхо в поле ответа — текстере только для речи кандидата.
    if (tts.isPlaying.value) return;
    partialText.value = text;
    options.value.value = composeLiveDictation(committedText.value, text);
  });

  const removeFinal = speechEngine.onFinal((text) => {
    if (activeSessionId !== sessionId) return;
    if (tts.isPlaying.value) return;
    const result = appendFinalDictationTranscript({
      currentText: committedText.value,
      sessionTranscript: sessionTranscript.value,
      finalTranscript: text,
    });
    committedText.value = result.text;
    sessionTranscript.value = result.sessionTranscript;
    options.value.value = result.text;
    partialText.value = '';
  });

  const removeError = speechEngine.onError(async (error) => {
    if (activeSessionId !== sessionId) return;
    const handled = await micPermissionGate.handleStartFailure(error);
    errorMessage.value = handled
      ? 'Микрофон недоступен. Проверьте разрешение в браузере.'
      : error instanceof Error
        ? error.message
        : 'Не удалось запустить диктовку';
  });

  async function start() {
    errorMessage.value = '';
    const priorPermissionState = await micPermissionGate.getPermissionState();
    if (!(await micPermissionGate.ensureCanStartCapture())) return;

    try {
      activeSessionId = sessionId;
      partialText.value = '';
      sessionTranscript.value = '';
      startedText.value = options.value.value;
      committedText.value = options.value.value;
      await speechEngine.start({ continuousMode: true });
    } catch (error) {
      activeSessionId = null;
      const handled = await micPermissionGate.handleStartFailure(error, {
        priorPermissionState,
      });
      errorMessage.value = handled
        ? 'Микрофон недоступен. Проверьте разрешение в браузере.'
        : error instanceof Error
          ? error.message
          : 'Не удалось запустить диктовку';
    }
  }

  async function stop() {
    if (activeSessionId === sessionId) {
      activeSessionId = null;
    }
    partialText.value = '';
    sessionTranscript.value = '';
    await speechEngine.stop();
  }

  async function toggle() {
    if (isListening.value) {
      await stop();
      return;
    }
    await start();
  }

  onUnmounted(() => {
    removePartial();
    removeFinal();
    removeError();
    if (activeSessionId === sessionId) {
      stop().catch(() => {});
    }
  });

  return {
    isListening,
    partialText,
    errorMessage,
    showMicDeniedModal: micPermissionGate.showMicDeniedModal,
    startedText,
    start,
    stop,
    toggle,
  };
}

// Живой предпросмотр: дописываем промежуточную фразу к зафиксированной базе
// через пробел (если нужен разделитель). Финал перезапишет это значение.
function composeLiveDictation(base: string, partial: string): string {
  const phrase = partial.trim();
  if (!phrase) return base;
  if (!base) return phrase;
  return /\s$/.test(base) ? `${base}${phrase}` : `${base} ${phrase}`;
}

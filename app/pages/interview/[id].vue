<script setup lang="ts">
  import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
  } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { nanoid } from 'nanoid';
  import type {
    InterviewDialogueRole,
    InterviewerFaceId,
    InterviewReportResponse,
    InterviewStateResponse,
    QuestionHintPack,
  } from '@/shared/dto';
  import {
    VideoIcon,
    ChatBubbleIcon,
    LightningBoltIcon,
    EnterFullScreenIcon,
    ExitFullScreenIcon,
    ExitIcon,
    Cross2Icon,
    PaperPlaneIcon,
    ArrowRightIcon,
    GearIcon,
    SpeakerLoudIcon,
  } from '@radix-icons/vue';
  import InterviewerCard from '@/app/components/interview/InterviewerCard.vue';
  import LocalCameraPreview from '@/app/components/interview/LocalCameraPreview.vue';
  import AudioPermissionDeniedDialog from '@/app/components/audio/AudioPermissionDeniedDialog.vue';
  import CameraPermissionDeniedDialog from '@/app/components/camera/CameraPermissionDeniedDialog.vue';
  import MicPermissionDeniedDialog from '@/app/components/mic/MicPermissionDeniedDialog.vue';
  import { RealtimeInterviewChatAdapter } from '@/app/services/realtime/realtimeInterviewChatAdapter';
  import { INTERVIEW_STREAM_MODE } from '@/app/constants/interview';
  import { getInterviewerFacePhotoSrc } from '@/app/utils/interviewerAssets';
  import { useRealtimeVoiceUiStore } from '@/app/stores/realtimeVoiceUi';
  import { resolveTtsVoiceForFace } from '@/shared/interviewerVoice';
  import { useAudioPermissionGate } from '@/app/composables/useAudioPermissionGate';
  import { useCameraPermissionGate } from '@/app/composables/useCameraPermissionGate';
  import { useMicPermissionGate } from '@/app/composables/useMicPermissionGate';

  type ConversationMessage = {
    id: string;
    role: 'assistant' | 'user' | 'hint';
    content: string;
    meta?: string;
    transient?: boolean;
  };

  const { t } = useI18n();
  const route = useRoute();
  const api = useAPI();
  const runtimeConfig = useRuntimeConfig();
  const tts = useTTS();
  const micPermissionGate = useMicPermissionGate();
  const audioPermissionGate = useAudioPermissionGate();
  const cameraPermissionGate = useCameraPermissionGate();

  const answer = ref('');
  const errorMessage = ref('');
  const isSending = ref(false);
  const isGeneratingReport = ref(false);
  // Идёт ручная озвучка реплики/вопроса (по клику на иконку динамика).
  const isSpeakingQuestion = ref(false);
  // Какой пузырь чата сейчас озвучивается (для подсветки его иконки).
  const speakingMessageId = ref<string | null>(null);
  // Интервьюер говорит в realtime-режиме (WebRTC-аудио модели).
  const realtimeSpeaking = ref(false);
  // Единое состояние «интервьюер сейчас говорит» — драйвит анимацию аватара:
  // ручная озвучка вопроса/реплики либо realtime-голос. В текстовом режиме
  // ответы по умолчанию не озвучиваются — только по клику пользователя.
  const isInterviewerSpeaking = computed(
    () => isSpeakingQuestion.value || realtimeSpeaking.value
  );
  // Статус realtime-голоса из глобального стора — для визуального индикатора
  // «соединение / на связи, можно говорить» в кабинете.
  const realtimeVoiceUi = useRealtimeVoiceUiStore();
  const voiceConnecting = computed(
    () => realtimeVoiceUi.status === 'connecting'
  );
  const voiceConnected = computed(() => realtimeVoiceUi.status === 'connected');
  const realtimeVoiceLocked = computed(
    () =>
      voiceConnecting.value ||
      voiceConnected.value ||
      realtimeVoiceUi.status === 'stopping'
  );
  const runtimeMessages = ref<ConversationMessage[]>([]);
  const realtimeAdapter = ref<RealtimeInterviewChatAdapter | null>(null);
  let realtimePersistQueue: Promise<void> = Promise.resolve();

  const sessionId = computed(() => String(route.params.id || ''));

  const {
    data: state,
    pending,
    refresh,
  } = await useAsyncData(
    () => `interview-${sessionId.value}`,
    () =>
      api<InterviewStateResponse>(`/api/interview/sessions/${sessionId.value}`)
  );

  const interviewerTtsVoice = computed(() =>
    resolveTtsVoiceForFace(state.value?.session.interviewerFaceId)
  );
  const currentTurn = computed(() => state.value?.currentTurn ?? null);
  const isDone = computed(() => state.value?.session.status === 'done');
  const isTtsEnabled = computed(
    () => runtimeConfig.public.featureTtsEnabled === true
  );
  const progressText = computed(() => {
    const session = state.value?.session;
    if (!session) return '';
    return t('interview.session.progressTimed', {
      current: session.currentQuestionIndex,
      goal: t(`interview.goal.${session.sessionGoal}.title`),
      minutes: session.expectedDurationMinutes,
    });
  });

  const currentHintPack = computed<QuestionHintPack | null>(() => {
    return currentTurn.value?.hintPack ?? null;
  });

  const planProgress = computed(() => {
    const items = state.value?.session.plan.items ?? [];
    const asked = items.filter((item) => item.status === 'asked').length;
    return {
      asked,
      total: items.length,
    };
  });

  const conversationMessages = computed<ConversationMessage[]>(() => {
    const turns = state.value?.turns ?? [];
    const persisted: ConversationMessage[] = [];
    for (const turn of turns) {
      persisted.push({
        id: `question-${turn.id}`,
        role: 'assistant',
        content: turn.question,
        meta:
          turn.kind === 'clarification'
            ? t('interview.session.clarification')
            : turn.questionSource === 'user'
            ? t('interview.session.userQuestion')
            : t('interview.session.question'),
      });
      // Живой диалог по вопросу: реплики кандидата и интервьюера.
      if (turn.messages?.length) {
        for (const [index, message] of turn.messages.entries()) {
          persisted.push({
            id: `dialogue-${turn.id}-${index}`,
            role: message.role === 'interviewer' ? 'assistant' : 'user',
            content: message.content,
          });
        }
      } else if (turn.answerTranscript && turn.answerTranscript !== '—') {
        // Старый формат (без диалога) — показываем сохранённый ответ.
        persisted.push({
          id: `answer-${turn.id}`,
          role: 'user',
          content: turn.answerTranscript,
          meta: t('interview.session.savedAnswer'),
        });
      }
    }
    return [...persisted, ...runtimeMessages.value];
  });

  // Автоскролл чата вниз. «Прилипаем» к низу, пока пользователь сам
  // не проскроллил вверх читать историю — тогда не дёргаем его.
  const chatFeed = ref<HTMLElement | null>(null);
  const stickToBottom = ref(true);

  function handleChatScroll() {
    const el = chatFeed.value;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.value = distanceFromBottom <= 120;
  }

  function scrollChatToBottom(behavior: ScrollBehavior = 'smooth') {
    const el = chatFeed.value;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  watch(
    () => conversationMessages.value.length,
    async () => {
      if (!stickToBottom.value) return;
      await nextTick();
      scrollChatToBottom('smooth');
    }
  );

  watch(
    () => realtimeVoiceUi.status,
    (status) => {
      if (status !== 'connected') {
        realtimeSpeaking.value = false;
      }
    }
  );

  function extractApiError(error: unknown): string {
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data?: { error?: { message?: string } } }).data;
      return data?.error?.message || t('interview.common.unknownError');
    }
    return error instanceof Error
      ? error.message
      : t('interview.common.unknownError');
  }

  function ensureRealtimeAdapter() {
    if (realtimeAdapter.value) return realtimeAdapter.value;
    realtimeAdapter.value = new RealtimeInterviewChatAdapter({
      createMessage(role, content) {
        const id = nanoid();
        // Без служебного заголовка вроде «LIVE TRANSCRIPT» — обычный чат,
        // роль и так видна по выравниванию/стилю пузыря.
        runtimeMessages.value.push({
          id,
          role,
          content,
          transient: true,
        });
        return id;
      },
      appendContent(messageId, delta) {
        const message = runtimeMessages.value.find(
          (item) => item.id === messageId
        );
        if (message) message.content += delta;
      },
      replaceContent(messageId, content) {
        const message = runtimeMessages.value.find(
          (item) => item.id === messageId
        );
        if (message) message.content = content;
      },
      removeMessage(messageId) {
        runtimeMessages.value = runtimeMessages.value.filter(
          (item) => item.id !== messageId
        );
      },
      onUserTranscriptCompleted(transcript) {
        handleRealtimeTranscript(transcript);
      },
      onAssistantTranscriptCompleted(transcript) {
        queueRealtimeDialogueMessage('interviewer', transcript);
      },
      onAssistantSpeechStarted() {
        realtimeSpeaking.value = true;
      },
      onAssistantSpeechEnded() {
        realtimeSpeaking.value = false;
      },
    });
    return realtimeAdapter.value;
  }

  function handleRealtimeEvent(event: unknown) {
    if (!event || typeof event !== 'object') return;
    ensureRealtimeAdapter().handleServerEvent(event as { type?: string });
  }

  function handleRealtimeTranscript(transcript: string) {
    const normalized = transcript.trim();
    if (!normalized) return;
    // В realtime реплики кандидата уже попадают в чат через адаптер.
    // В поле ответа ничего НЕ пишем. По голосовой команде — переходим дальше.
    if (isNextQuestionCommand(normalized)) {
      void goToNextQuestion();
      return;
    }
    queueRealtimeDialogueMessage('user', normalized);
  }

  function isNextQuestionCommand(value: string): boolean {
    return /^(следующий вопрос|следующий|дальше|перейдём дальше|перейдем дальше|переходим дальше|давай дальше)[.!]?$/i.test(
      value.trim()
    );
  }

  const suggestMoveOn = computed(
    () => currentTurn.value?.suggestMoveOn === true
  );

  function queueRealtimeDialogueMessage(
    role: InterviewDialogueRole,
    content: string
  ) {
    const turn = currentTurn.value;
    const normalized = content.trim();
    if (!turn || !normalized) return;

    realtimePersistQueue = realtimePersistQueue
      .then(() => persistRealtimeDialogueMessage(turn.id, role, normalized))
      .catch((err) => {
        errorMessage.value = extractApiError(err);
      });
  }

  async function persistRealtimeDialogueMessage(
    turnId: string,
    role: InterviewDialogueRole,
    content: string
  ) {
    await api<InterviewStateResponse>(
      `/api/interview/sessions/${sessionId.value}/dialogue`,
      {
        method: 'POST',
        body: { turnId, role, content },
      }
    );
  }

  async function flushRealtimePersistence() {
    await realtimePersistQueue;
  }

  // Останавливает любую текущую озвучку интервьюера и сбрасывает подсветку.
  function stopSpeech() {
    tts.stop();
    speakingMessageId.value = null;
    isSpeakingQuestion.value = false;
  }

  // Озвучить конкретную реплику интервьюера по клику. Повторный клик по той же
  // реплике останавливает воспроизведение. В текстовом режиме это единственный
  // способ услышать ответ — авто-озвучки нет.
  async function speakMessage(message: ConversationMessage) {
    if (
      message.role !== 'assistant' ||
      !message.content.trim() ||
      !isTtsEnabled.value ||
      realtimeVoiceLocked.value
    ) {
      return;
    }

    if (speakingMessageId.value === message.id) {
      stopSpeech();
      return;
    }

    tts.stop();
    speakingMessageId.value = message.id;
    isSpeakingQuestion.value = true;
    try {
      await tts.speak(message.content, { voice: interviewerTtsVoice.value });
    } finally {
      if (speakingMessageId.value === message.id) {
        speakingMessageId.value = null;
      }
      isSpeakingQuestion.value = false;
    }
  }

  // Реплика кандидата в диалоге по текущему вопросу (без перехода дальше).
  async function sendMessage() {
    const turn = currentTurn.value;
    const message = answer.value.trim();
    if (
      !turn ||
      message.length < 1 ||
      isSending.value ||
      realtimeVoiceLocked.value
    ) {
      return;
    }

    isSending.value = true;
    errorMessage.value = '';
    // Очищаем поле сразу при отправке — реплика тут же уходит в чат
    // (оптимистичный пузырь), а текстере освобождается под следующий ответ.
    answer.value = '';
    try {
      if (INTERVIEW_STREAM_MODE) {
        await sendMessageStreaming(turn.id, message);
      } else {
        state.value = await api<InterviewStateResponse>(
          `/api/interview/sessions/${sessionId.value}/reply`,
          {
            method: 'POST',
            body: { turnId: turn.id, message },
          }
        );
      }
    } catch (err) {
      errorMessage.value = extractApiError(err);
      // Отправка не удалась — возвращаем текст, чтобы пользователь не потерял ввод.
      if (!answer.value.trim()) answer.value = message;
    } finally {
      isSending.value = false;
    }
  }

  // Стрим ответа интервьюера по SSE. Дельты раскрываются через короткую очередь:
  // если браузер получил несколько SSE-событий пачкой, пользователь всё равно
  // видит последовательное появление ответа. Озвучка в текстовом режиме не
  // запускается автоматически — слушать ответ можно по иконке в пузыре чата.
  async function sendMessageStreaming(turnId: string, message: string) {
    // Оптимистично показываем реплику кандидата и растущий пузырь интервьюера.
    const userMsgId = nanoid();
    const assistantMsgId = nanoid();
    runtimeMessages.value.push(
      { id: userMsgId, role: 'user', content: message, transient: true },
      { id: assistantMsgId, role: 'assistant', content: '', transient: true }
    );
    stickToBottom.value = true;
    await nextTick();
    scrollChatToBottom('smooth');

    const dropOptimistic = () => {
      runtimeMessages.value = runtimeMessages.value.filter(
        (m) => m.id !== userMsgId && m.id !== assistantMsgId
      );
    };

    let finalState: InterviewStateResponse | null = null;
    let streamError: { code: string; message: string } | null = null;
    let revealCancelled = false;
    let revealPromise: Promise<void> | null = null;
    const revealQueue: string[] = [];

    const wait = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));

    function splitRevealChunks(text: string): string[] {
      const chunks: string[] = [];
      let current = '';
      for (const char of text) {
        current += char;
        if (current.length >= 8 || /[\s,.!?;:)\]]/.test(char)) {
          chunks.push(current);
          current = '';
        }
      }
      if (current) chunks.push(current);
      return chunks;
    }

    // Видимое раскрытие дельты: даже если браузер получил SSE пачкой, текст
    // появляется небольшими фрагментами, а не одним финальным блоком.
    // В текстовом режиме ответ НЕ озвучивается автоматически — только текст.
    const revealDelta = (text: string) => {
      if (revealCancelled) return;
      const msg = runtimeMessages.value.find((m) => m.id === assistantMsgId);
      if (msg) msg.content += text;
      if (stickToBottom.value) void nextTick(() => scrollChatToBottom('auto'));
    };

    const pumpRevealQueue = () => {
      if (revealPromise) return revealPromise;
      revealPromise = (async () => {
        while (!revealCancelled && revealQueue.length) {
          const chunk = revealQueue.shift();
          if (chunk) revealDelta(chunk);
          if (revealQueue.length) await wait(18);
        }
      })().finally(() => {
        revealPromise = null;
      });
      return revealPromise;
    };

    const enqueueDelta = (text: string) => {
      if (!text || revealCancelled) return;
      revealQueue.push(...splitRevealChunks(text));
      void pumpRevealQueue();
    };

    const waitForRevealQueue = async () => {
      while (revealQueue.length || revealPromise) {
        await (revealPromise ?? pumpRevealQueue());
      }
    };

    const parseSseEvent = (rawEvent: string) => {
      const jsonText = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''))
        .join('\n');
      if (!jsonText || jsonText === '[DONE]') return;

      try {
        const obj = JSON.parse(jsonText);
        const delta =
          typeof obj.output_text_delta === 'string'
            ? obj.output_text_delta
            : typeof obj.delta === 'string'
            ? obj.delta
            : '';
        if (delta) enqueueDelta(delta);
        if (obj.error) {
          streamError = obj.error;
        }
        if (obj.done && obj.state) {
          finalState = obj.state as InterviewStateResponse;
        }
      } catch {
        // Неполный/битый чанк — пропускаем.
      }
    };

    let response: Response;
    try {
      response = await fetch(
        `/api/interview/sessions/${sessionId.value}/reply-stream`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            accept: 'text/event-stream',
            ...streamCsrfHeader(),
          },
          body: JSON.stringify({ turnId, message }),
        }
      );
    } catch (err) {
      dropOptimistic();
      throw err;
    }

    if (!response.ok || !response.body) {
      dropOptimistic();
      throw new Error('Не удалось получить ответ интервьюера');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // Аккуратно буферизуем SSE: события могут быть разрезаны по чанкам.
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');

        for (;;) {
          const separatorIndex = buffer.indexOf('\n\n');
          if (separatorIndex === -1) break;
          const rawEvent = buffer.slice(0, separatorIndex).trim();
          buffer = buffer.slice(separatorIndex + 2);
          if (!rawEvent) continue;
          parseSseEvent(rawEvent);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) parseSseEvent(buffer.trim());
      await waitForRevealQueue();
    } catch (err) {
      revealCancelled = true;
      revealQueue.length = 0;
      stopSpeech();
      dropOptimistic();
      throw err;
    }

    if (streamError) {
      revealCancelled = true;
      revealQueue.length = 0;
      stopSpeech();
      dropOptimistic();
      throw { data: { error: streamError } };
    }

    if (finalState) {
      state.value = finalState;
    } else {
      // Стрим оборвался без финального состояния — подтягиваем актуальное
      // состояние с сервера (ответ мог сохраниться).
      await refresh();
    }
    // Финальные сообщения уже в state — снимаем оптимистичные пузыри.
    dropOptimistic();
    await nextTick();
    if (stickToBottom.value) scrollChatToBottom('smooth');
  }

  // CSRF-заголовок для прямого fetch (минуя useAPI) к стрим-эндпоинту.
  function streamCsrfHeader(): Record<string, string> {
    if (typeof document === 'undefined') return {};
    const prefix = 'jobai_csrf=';
    const raw = document.cookie
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix));
    return raw
      ? { 'x-csrf-token': decodeURIComponent(raw.slice(prefix.length)) }
      : {};
  }

  // Явный переход к следующему вопросу (кнопка / голосовая команда / согласие).
  async function goToNextQuestion() {
    const turn = currentTurn.value;
    if (!turn || isSending.value) return;

    isSending.value = true;
    errorMessage.value = '';
    stopSpeech();
    try {
      await flushRealtimePersistence();
      state.value = await api<InterviewStateResponse>(
        `/api/interview/sessions/${sessionId.value}/next`,
        {
          method: 'POST',
          body: { turnId: turn.id },
        }
      );
      answer.value = '';
      runtimeMessages.value = [];
      realtimeAdapter.value = null;
    } catch (err) {
      errorMessage.value = extractApiError(err);
    } finally {
      isSending.value = false;
    }
  }

  async function speakQuestion() {
    const question = currentTurn.value?.question;
    if (
      !question ||
      !isTtsEnabled.value ||
      isSpeakingQuestion.value ||
      realtimeVoiceLocked.value
    ) {
      return;
    }

    isSpeakingQuestion.value = true;
    try {
      await tts.speak(question, { voice: interviewerTtsVoice.value });
    } finally {
      isSpeakingQuestion.value = false;
    }
  }

  async function generateReport() {
    if (!state.value?.session.id || isGeneratingReport.value) return;

    isGeneratingReport.value = true;
    errorMessage.value = '';
    try {
      await flushRealtimePersistence();
      const response = await api<InterviewReportResponse>(
        `/api/interview/sessions/${state.value.session.id}/report`,
        { method: 'POST' }
      );
      if (response.report?.id) {
        await navigateTo(`/interview/report/${response.report.id}`);
      }
    } catch (err) {
      errorMessage.value = extractApiError(err);
    } finally {
      isGeneratingReport.value = false;
    }
  }

  // --- Выбор интервьюера (внешность + тон) прямо в кабинете ---
  // Лицо кодирует пол и тон; выбор меняет и фото, и манеру ИИ на лету.
  const interviewerPickerOpen = ref(false);
  const isChangingInterviewer = ref(false);
  const failedThumbs = ref<Set<string>>(new Set());

  watch(interviewerPickerOpen, (open) => {
    if (open) failedThumbs.value = new Set();
  });

  const interviewerFaceGroups = [
    {
      key: 'male',
      label: 'interview.session.interviewerPicker.male',
      options: [
        { id: 'male-soft', modeLabel: 'interview.mode.soft' },
        { id: 'male-neutral', modeLabel: 'interview.mode.neutral' },
        { id: 'male-strict', modeLabel: 'interview.mode.strict' },
      ],
    },
    {
      key: 'female',
      label: 'interview.session.interviewerPicker.female',
      options: [
        { id: 'female-soft', modeLabel: 'interview.mode.soft' },
        { id: 'female-neutral', modeLabel: 'interview.mode.neutral' },
        { id: 'female-strict', modeLabel: 'interview.mode.strict' },
      ],
    },
  ] as const;

  function onThumbError(id: string) {
    const next = new Set(failedThumbs.value);
    next.add(id);
    failedThumbs.value = next;
  }

  async function changeInterviewer(faceId: InterviewerFaceId) {
    if (isChangingInterviewer.value) return;
    if (state.value?.session.interviewerFaceId === faceId) {
      interviewerPickerOpen.value = false;
      return;
    }
    isChangingInterviewer.value = true;
    errorMessage.value = '';
    stopSpeech();
    try {
      state.value = await api<InterviewStateResponse>(
        `/api/interview/sessions/${sessionId.value}/interviewer`,
        { method: 'POST', body: { faceId } }
      );
      interviewerPickerOpen.value = false;
    } catch (err) {
      errorMessage.value = extractApiError(err);
    } finally {
      isChangingInterviewer.value = false;
    }
  }

  // --- Режим видеозвонка: полный экран, камера, скрываемые панели ---
  const isFullscreen = ref(false);
  const cameraEnabled = ref(false); // по умолчанию камера выключена, как в Zoom
  const cameraLive = ref(false);
  const chatOpen = ref(true); // боковой чат
  const hintsOpen = ref(false); // боковые подсказки

  function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
  }

  function toggleCamera() {
    cameraEnabled.value = !cameraEnabled.value;
    if (!cameraEnabled.value) {
      cameraLive.value = false;
    }
  }

  function handleCameraActiveChange(active: boolean) {
    cameraLive.value = active;
  }

  function handleCameraStartFailed() {
    cameraEnabled.value = false;
    cameraLive.value = false;
  }

  function toggleChat() {
    chatOpen.value = !chatOpen.value;
  }

  function toggleHints() {
    hintsOpen.value = !hintsOpen.value;
  }

  // «Завершить интервью» — формируем отчёт и уходим на разбор.
  function endInterview() {
    void generateReport();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isFullscreen.value) {
      isFullscreen.value = false;
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown);
    // При входе сразу показываем последние сообщения.
    void nextTick(() => scrollChatToBottom('auto'));
  });
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    stopSpeech();
  });
</script>

<template>
  <div class="page">
    <header class="header">
      <NuxtLink to="/interview/new" class="back">{{
        t('interview.session.back')
      }}</NuxtLink>
      <div>
        <p class="eyebrow">{{ progressText }}</p>
        <h1>
          {{
            state?.session.vacancyTitle ||
            state?.session.role ||
            t('interview.session.title')
          }}
        </h1>
        <p>
          {{ state?.session.companyName || t('interview.session.subtitle') }}
        </p>
      </div>
    </header>

    <section v-if="pending" class="panel">
      <p>{{ t('interview.session.loading') }}</p>
    </section>

    <template v-else-if="state">
      <section v-if="isDone" class="panel done">
        <h2>{{ t('interview.session.done.title') }}</h2>
        <p>{{ t('interview.session.done.subtitle') }}</p>
        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        <div class="done-actions">
          <button
            class="primary"
            type="button"
            :disabled="isGeneratingReport"
            @click="generateReport"
          >
            {{
              isGeneratingReport
                ? t('interview.session.done.generatingReport')
                : t('interview.session.done.generateReport')
            }}
          </button>
          <NuxtLink class="primary-link secondary-link" to="/history">
            {{ t('interview.session.done.history') }}
          </NuxtLink>
        </div>
      </section>

      <section
        v-else-if="currentTurn"
        class="call"
        :class="{
          'call--fs': isFullscreen,
          'call--side': chatOpen || hintsOpen,
        }"
      >
        <!-- Сцена: вертикальный стек видео + вопрос + нижний док -->
        <div class="call-stage">
          <div class="videos">
            <!-- Интервьюер сверху -->
            <div class="vtile vtile--peer">
              <InterviewerCard
                :avatar-id="state.session.interviewerAvatarId"
                :mode="state.session.interviewerMode"
                :face-id="state.session.interviewerFaceId"
                :is-speaking="isInterviewerSpeaking"
              />
              <button
                class="interviewer-settings"
                type="button"
                v-tooltip="t('interview.session.interviewerPicker.open')"
                :aria-label="t('interview.session.interviewerPicker.open')"
                @click="interviewerPickerOpen = true"
              >
                <GearIcon aria-hidden="true" />
              </button>
              <div
                v-if="voiceConnecting || voiceConnected"
                class="voice-live"
                :class="{
                  'voice-live--connecting': voiceConnecting,
                  'voice-live--ready': voiceConnected,
                }"
                role="status"
                aria-live="polite"
              >
                <span class="voice-live-dot" aria-hidden="true"></span>
                <span>
                  {{
                    voiceConnected
                      ? t('voice.realtime.readyToSpeak')
                      : t('voice.realtime.status.connecting')
                  }}
                </span>
              </div>
            </div>
            <!-- Кандидат снизу -->
            <div class="vtile vtile--self">
              <LocalCameraPreview
                :active="cameraEnabled"
                @active-change="handleCameraActiveChange"
                @start-failed="handleCameraStartFailed"
              />
              <span class="vtile-name">{{ t('interview.session.you') }}</span>
            </div>
          </div>

          <!-- Текущий вопрос -->
          <div class="now-question">
            <span class="badge">
              {{
                currentTurn.kind === 'clarification'
                  ? t('interview.session.clarification')
                  : t('interview.session.question')
              }}
            </span>
            <p>{{ currentTurn.question }}</p>
            <button
              v-if="isTtsEnabled"
              class="listen-mini"
              type="button"
              v-tooltip="t('voice.tts.listen')"
              :disabled="isSpeakingQuestion || realtimeVoiceLocked"
              :aria-label="t('voice.tts.listen')"
              @click="speakQuestion"
            >
              <SpeakerLoudIcon aria-hidden="true" />
            </button>
          </div>

          <!-- Нижний док с иконками (управление звонком) -->
          <div class="dock glass-frame">
            <button
              class="dock-btn"
              :class="{
                'dock-btn--active': cameraLive,
                'dock-btn--off': !cameraLive,
              }"
              type="button"
              v-tooltip="t('interview.session.controls.cameraTip')"
              @click="toggleCamera"
            >
              <VideoIcon aria-hidden="true" />
              <span class="dock-label">{{
                t('interview.session.controls.camera')
              }}</span>
            </button>

            <button
              class="dock-btn"
              :class="{ 'dock-btn--active': chatOpen }"
              type="button"
              v-tooltip="t('interview.session.controls.chatTip')"
              @click="toggleChat"
            >
              <ChatBubbleIcon aria-hidden="true" />
              <span class="dock-label">{{
                t('interview.session.tabs.chat')
              }}</span>
            </button>

            <button
              class="dock-btn"
              :class="{ 'dock-btn--active': hintsOpen }"
              type="button"
              v-tooltip="t('interview.session.controls.hintsTip')"
              @click="toggleHints"
            >
              <LightningBoltIcon aria-hidden="true" />
              <span class="dock-label">{{
                t('interview.session.tabs.hints')
              }}</span>
            </button>

            <button
              class="dock-btn"
              :class="{ 'dock-btn--active': isFullscreen }"
              type="button"
              v-tooltip="
                isFullscreen
                  ? t('interview.session.controls.exitFs')
                  : t('interview.session.controls.enterFs')
              "
              @click="toggleFullscreen"
            >
              <ExitFullScreenIcon v-if="isFullscreen" aria-hidden="true" />
              <EnterFullScreenIcon v-else aria-hidden="true" />
              <span class="dock-label">{{
                t('interview.session.controls.screen')
              }}</span>
            </button>

            <button
              class="dock-btn dock-btn--end"
              type="button"
              :disabled="isGeneratingReport"
              v-tooltip="t('interview.session.controls.end')"
              @click="endInterview"
            >
              <ExitIcon aria-hidden="true" />
              <span class="dock-label">{{
                t('interview.session.controls.endShort')
              }}</span>
            </button>
          </div>
        </div>

        <!-- Боковые панели: чат и подсказки (скрываемые, независимые) -->
        <div v-if="chatOpen || hintsOpen" class="call-side">
          <aside v-if="chatOpen" class="side-panel glass-frame">
            <header class="side-head">
              <h3>{{ t('interview.session.tabs.chat') }}</h3>
              <button
                class="side-close"
                type="button"
                v-tooltip="t('interview.session.controls.hidePanel')"
                @click="toggleChat"
              >
                <Cross2Icon aria-hidden="true" />
              </button>
            </header>

            <ol
              ref="chatFeed"
              class="chat-feed"
              aria-live="polite"
              @scroll="handleChatScroll"
            >
              <li
                v-for="message in conversationMessages"
                :key="message.id"
                class="chat-message"
                :class="`chat-message--${message.role}`"
              >
                <small v-if="message.meta">{{ message.meta }}</small>
                <p>{{ message.content }}</p>
                <button
                  v-if="isTtsEnabled && message.role === 'assistant'"
                  class="bubble-listen"
                  :class="{
                    'bubble-listen--active': speakingMessageId === message.id,
                  }"
                  type="button"
                  :disabled="realtimeVoiceLocked"
                  v-tooltip="
                    speakingMessageId === message.id
                      ? t('voice.tts.stop')
                      : t('voice.tts.listen')
                  "
                  :aria-label="
                    speakingMessageId === message.id
                      ? t('voice.tts.stop')
                      : t('voice.tts.listen')
                  "
                  @click="speakMessage(message)"
                >
                  <SpeakerLoudIcon aria-hidden="true" />
                </button>
              </li>
            </ol>

            <!-- Переход к следующему вопросу. Подсвечивается, когда ИИ предложил. -->
            <div
              class="next-row"
              :class="{ 'next-row--suggest': suggestMoveOn }"
            >
              <span v-if="suggestMoveOn" class="next-hint">
                {{ t('interview.session.moveOnHint') }}
              </span>
              <button
                class="next-btn"
                type="button"
                :disabled="isSending"
                @click="goToNextQuestion"
              >
                {{ t('interview.session.nextQuestion') }}
                <ArrowRightIcon aria-hidden="true" />
              </button>
            </div>

            <form class="composer" @submit.prevent="sendMessage">
              <textarea
                id="answer"
                v-model="answer"
                rows="3"
                :disabled="isSending || realtimeVoiceLocked"
                :placeholder="t('interview.session.replyPlaceholder')"
              />
              <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
              <div class="composer-actions">
                <div class="composer-tools">
                  <VoiceInput
                    v-model="answer"
                    :disabled="isSending || realtimeVoiceLocked"
                  />
                  <RealtimeVoicePanel
                    variant="icon"
                    :session-id="sessionId"
                    :disabled="isSending"
                    :realtime-limits="state.session.realtimeLimits"
                    :voice-profile-key="state.session.interviewerFaceId"
                    :on-event="handleRealtimeEvent"
                  />
                </div>
                <button
                  class="send-btn"
                  type="submit"
                  :disabled="
                    answer.trim().length < 1 || isSending || realtimeVoiceLocked
                  "
                  v-tooltip="t('interview.session.send')"
                  :aria-label="t('interview.session.send')"
                >
                  <PaperPlaneIcon aria-hidden="true" />
                </button>
              </div>
            </form>
          </aside>

          <aside v-if="hintsOpen" class="side-panel glass-frame">
            <header class="side-head">
              <h3>{{ t('interview.session.tabs.hints') }}</h3>
              <button
                class="side-close"
                type="button"
                v-tooltip="t('interview.session.controls.hidePanel')"
                @click="toggleHints"
              >
                <Cross2Icon aria-hidden="true" />
              </button>
            </header>

            <div class="hints-pane">
              <section class="hint-focus">
                <p class="coach-label">{{ t('interview.session.hints') }}</p>
                <h3>
                  {{
                    currentHintPack?.structure || t('interview.session.noHints')
                  }}
                </h3>
                <ul v-if="currentHintPack" class="hint-list">
                  <li v-for="item in currentHintPack.bullets" :key="item">
                    {{ item }}
                  </li>
                </ul>
              </section>

              <details class="plan-disclosure">
                <summary>
                  <span>
                    <em class="coach-label">{{
                      t('interview.session.plan')
                    }}</em>
                    <strong>{{
                      t('interview.session.planProgress', planProgress)
                    }}</strong>
                  </span>
                </summary>
                <ol class="plan-list">
                  <li
                    v-for="item in state.session.plan.items"
                    :key="item.id"
                    :class="{ 'plan-item--asked': item.status === 'asked' }"
                  >
                    <span>{{ item.index }}</span>
                    <p>
                      {{
                        item.question ||
                        t('interview.session.plannedJobAiQuestion')
                      }}
                    </p>
                  </li>
                </ol>
              </details>
            </div>
          </aside>
        </div>
      </section>
    </template>

    <!-- Модалка выбора интервьюера: внешность + тон (меняются вместе). -->
    <div
      v-if="interviewerPickerOpen && state"
      class="picker-overlay"
      @click.self="interviewerPickerOpen = false"
    >
      <div class="picker-modal glass-frame" role="dialog" aria-modal="true">
        <header class="picker-head">
          <div>
            <h3>{{ t('interview.session.interviewerPicker.title') }}</h3>
            <p>{{ t('interview.session.interviewerPicker.subtitle') }}</p>
          </div>
          <button
            class="side-close"
            type="button"
            :aria-label="t('interview.session.interviewerPicker.close')"
            @click="interviewerPickerOpen = false"
          >
            <Cross2Icon aria-hidden="true" />
          </button>
        </header>

        <div
          v-for="group in interviewerFaceGroups"
          :key="group.key"
          class="picker-group"
        >
          <p class="picker-group-label">{{ t(group.label) }}</p>
          <div class="picker-grid">
            <button
              v-for="opt in group.options"
              :key="opt.id"
              type="button"
              class="picker-card"
              :class="{
                'picker-card--active':
                  state.session.interviewerFaceId === opt.id,
              }"
              :disabled="isChangingInterviewer"
              @click="changeInterviewer(opt.id)"
            >
              <span class="picker-thumb">
                <img
                  v-if="!failedThumbs.has(opt.id)"
                  :src="getInterviewerFacePhotoSrc(opt.id)"
                  :alt="t(opt.modeLabel)"
                  @error="onThumbError(opt.id)"
                />
                <em v-else class="picker-initials">{{
                  group.key === 'male' ? 'М' : 'Ж'
                }}</em>
              </span>
              <span class="picker-mode">{{ t(opt.modeLabel) }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <MicPermissionDeniedDialog
      :open="micPermissionGate.showMicDeniedModal.value"
      :mode="micPermissionGate.dialogMode.value"
      @update:open="micPermissionGate.setMicDeniedModalOpen"
    />
    <AudioPermissionDeniedDialog
      :open="audioPermissionGate.showAudioBlockedModal.value"
      @update:open="audioPermissionGate.setAudioBlockedModalOpen"
    />
    <CameraPermissionDeniedDialog
      :open="cameraPermissionGate.showCameraDeniedModal.value"
      :mode="cameraPermissionGate.dialogMode.value"
      @update:open="cameraPermissionGate.setCameraDeniedModalOpen"
    />
  </div>
</template>

<style scoped>
  .page {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }
  .header {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .header h1,
  .header p {
    margin: 0;
  }
  .header p {
    color: var(--color-muted);
  }
  .back {
    color: var(--color-accent);
    font-weight: 700;
    text-decoration: none;
  }
  .eyebrow {
    color: var(--color-accent) !important;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 20px;
  }

  .stage-shell {
    display: flex;
    flex-direction: column;
    gap: 16px;
    border: 1px solid var(--glass-border);
    background: var(--surface);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-panel);
    padding: 14px;
  }

  .stage-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 0.38fr);
    gap: 12px;
  }

  .side-stage {
    display: grid;
    gap: 8px;
    align-content: start;
  }

  .side-label {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 800;
  }

  .conversation-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 0.42fr);
    gap: 14px;
    align-items: start;
  }

  .chat-panel,
  .coach-panel {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    box-shadow: inset 0 1px 0 var(--inner-highlight);
  }

  .chat-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
  }

  .chat-head {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: flex-start;
  }

  .chat-head h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: clamp(20px, 2vw, 28px);
    line-height: 1.2;
  }

  .badge {
    align-self: flex-start;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent-2);
    font-size: 13px;
    font-weight: 800;
    padding: 6px 10px;
  }
  .listen-button {
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    color: var(--text-primary);
    background: var(--surface-raised);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    padding: 9px 12px;
    white-space: nowrap;
  }
  .listen-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .chat-feed {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 280px;
    max-height: 520px;
    margin: 0;
    padding: 0 3px 0 0;
    overflow-y: auto;
    list-style: none;
  }

  .chat-message {
    display: grid;
    gap: 5px;
    max-width: min(82%, 720px);
    padding: 12px 14px;
    border: 1px solid var(--glass-border);
    border-radius: 16px;
    background: var(--surface-raised);
  }

  .chat-message--user {
    align-self: flex-end;
    background: color-mix(in srgb, var(--accent) 16%, var(--surface-raised));
  }

  .chat-message--assistant {
    align-self: flex-start;
    position: relative;
    padding-right: 42px;
  }

  /* Иконка озвучки в правом нижнем углу пузыря интервьюера. */
  .bubble-listen {
    position: absolute;
    right: 7px;
    bottom: 7px;
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--glass-border);
    border-radius: 8px;
    background: var(--surface-soft);
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0.7;
    padding: 0;
    transition: color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      opacity var(--motion-fast) var(--ease-out);
  }
  .bubble-listen svg {
    width: 14px;
    height: 14px;
  }
  .bubble-listen:hover:not(:disabled),
  .bubble-listen:focus-visible {
    opacity: 1;
    color: var(--text-primary);
    border-color: var(--glass-border-strong);
  }
  .bubble-listen--active {
    opacity: 1;
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .bubble-listen:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .chat-message--hint {
    align-self: center;
    background: color-mix(in srgb, var(--accent-2) 10%, var(--surface-raised));
  }

  .chat-message small {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .chat-message p {
    margin: 0;
    color: var(--text-primary);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .coach-panel {
    display: grid;
    gap: 14px;
    padding: 14px;
  }

  .coach-panel section {
    display: grid;
    gap: 10px;
  }

  .coach-panel h3,
  .coach-panel p {
    margin: 0;
  }

  .coach-label {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    font-style: normal;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .plan-list,
  .hint-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plan-list li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 9px;
    align-items: start;
    color: var(--text-muted);
  }

  .plan-list span {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: var(--surface-raised);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 900;
  }

  .plan-list p,
  .hint-list li {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .plan-item--asked p,
  .plan-item--asked span {
    color: var(--text-primary);
  }

  .hint-card {
    border-top: 1px solid var(--glass-border);
    padding-top: 12px;
  }

  .answer-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  label {
    font-size: 14px;
    font-weight: 700;
  }
  textarea {
    width: 100%;
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    background: var(--surface-raised);
    color: var(--text-primary);
    font: inherit;
    padding: 12px;
    resize: vertical;
  }
  .primary,
  .ghost,
  .primary-link {
    border-radius: 10px;
    font: inherit;
    font-weight: 700;
  }
  .primary {
    align-self: flex-end;
    border: 0;
    background: var(--color-accent);
    color: #fff;
    cursor: pointer;
    padding: 12px 18px;
  }
  .primary:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .ghost {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    padding: 8px 12px;
  }
  .primary-link {
    display: inline-flex;
    align-self: flex-start;
    background: var(--color-accent);
    color: #fff;
    padding: 11px 14px;
    text-decoration: none;
  }
  .secondary-link {
    background: var(--color-bg);
    color: var(--color-text);
  }
  .error {
    margin: 0;
    color: var(--color-danger);
    font-weight: 700;
  }
  .done {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .done h2,
  .done p {
    margin: 0;
  }
  .done-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .history-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }
  .history-head h2 {
    margin: 0;
    font-size: 18px;
  }
  .turns {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .turn {
    border-top: 1px solid var(--color-border);
    padding-top: 12px;
  }
  .turn-question {
    display: flex;
    gap: 10px;
  }
  .turn-body {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .turn-num {
    display: grid;
    place-items: center;
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: var(--color-bg);
    color: var(--color-muted);
    font-size: 13px;
    font-weight: 800;
  }
  .turn-num--sub {
    background: transparent;
    color: var(--color-accent);
  }
  .turn-tag {
    color: var(--color-accent);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .turn--clarify .turn-question strong {
    color: var(--color-text);
    font-weight: 600;
  }
  .turn-answer {
    margin: 8px 0 0 38px;
    color: var(--color-muted);
    white-space: pre-wrap;
  }

  @media (max-width: 640px) {
    .panel {
      padding: 15px;
    }
    .primary {
      align-self: stretch;
    }
    .question-head {
      grid-template-columns: 1fr;
    }
    .listen-button {
      justify-self: start;
    }
    .stage-shell {
      padding: 10px;
    }
    .stage-grid {
      grid-template-columns: 1fr;
    }
    .chat-panel {
      padding: 14px;
    }
    .conversation-layout {
      grid-template-columns: 1fr;
    }
    .chat-message {
      max-width: 100%;
    }
    .chat-head {
      flex-direction: column;
    }
  }

  /* ===================== Режим видеозвонка (Телемост) ===================== */
  .call {
    display: flex;
    gap: 16px;
    align-items: stretch;
    min-width: 0;
    min-height: 74vh;
  }

  .call--fs {
    position: fixed;
    inset: 0;
    z-index: 200;
    min-height: 0;
    padding: 16px;
    background: var(--surface-0, #0b0e1a);
  }

  /* Сцена с видео */
  .call-stage {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: 14px;
    min-width: min(100%, 220px);
  }

  .videos {
    display: grid;
    grid-template-rows: 1.35fr 1fr;
    gap: 12px;
    flex: 1;
    min-height: 360px;
  }

  .vtile {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg, 18px);
    background: #0c1022;
    min-height: 0;
  }

  .vtile :deep(.interviewer),
  .vtile :deep(.camera) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .vtile-name {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 2;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .voice-live {
    position: absolute;
    left: 12px;
    top: 12px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    max-width: calc(100% - 72px);
    gap: 8px;
    padding: 7px 11px;
    border: 1px solid rgba(255, 255, 255, 0.32);
    border-radius: 999px;
    background: rgba(8, 12, 24, 0.62);
    color: #fff;
    backdrop-filter: blur(6px);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.2;
  }

  .voice-live-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
  }

  .voice-live--connecting {
    color: #f8d479;
  }

  .voice-live--connecting .voice-live-dot {
    animation: voice-live-pulse 1s ease-in-out infinite;
  }

  .voice-live--ready {
    color: #8ff0b0;
  }

  @keyframes voice-live-pulse {
    0%,
    100% {
      opacity: 0.45;
      transform: scale(0.86);
    }
    50% {
      opacity: 1;
      transform: scale(1.18);
    }
  }

  /* Текущий вопрос */
  .now-question {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'badge listen'
      'question listen';
    align-items: center;
    column-gap: 14px;
    row-gap: 8px;
    min-width: 0;
    padding: 14px 16px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--surface-soft);
  }

  .now-question .badge {
    grid-area: badge;
  }

  .now-question p {
    grid-area: question;
    min-width: 0;
    margin: 0;
    font-size: clamp(15px, 1.4vw, 18px);
    font-weight: 600;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .listen-mini {
    grid-area: listen;
    display: inline-grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    background: var(--surface-raised);
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0;
    transition: background var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }
  .listen-mini svg {
    width: 18px;
    height: 18px;
  }
  .listen-mini:hover:not(:disabled),
  .listen-mini:focus-visible {
    border-color: var(--glass-border-strong);
    color: var(--text-primary);
    transform: translateY(-1px);
  }
  .listen-mini:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 65%, transparent);
    outline-offset: 2px;
  }
  .listen-mini:disabled {
    cursor: default;
    opacity: 0.55;
  }

  /* Нижний док с иконками */
  .dock {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
    /* border: 1px solid rgba(82, 93, 142, 0.16);
    border-radius: var(--radius-lg, 18px);
    background: rgba(248, 250, 255, 0.96);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 10px 34px rgba(23, 31, 56, 0.08); */
    color: #242942;
  }

  .dock-btn {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 64px;
    min-height: 56px;
    padding: 6px 12px;
    border: 1px solid transparent;
    border-radius: 14px;
    background: transparent;
    color: #68708a;
    cursor: pointer;
    outline: none;
    font: inherit;
    transition: background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      box-shadow var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }

  .dock-btn svg {
    width: 22px;
    height: 22px;
  }

  .dock-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .dock-btn:hover:not(:disabled):not(.dock-btn--active):not(.dock-btn--end),
  .dock-btn:focus-visible:not(:disabled):not(.dock-btn--active):not(
      .dock-btn--end
    ) {
    background: rgba(232, 237, 250, 0.82);
    color: #23283c;
  }

  .dock-btn:focus-visible {
    border-color: color-mix(in srgb, var(--accent) 72%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent),
      inset 0 1px 0 var(--inner-highlight);
  }

  .dock-btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  /* Активное состояние тоггла (камера / чат / подсказки / экран). */
  .dock-btn--active,
  .dock-btn--active:hover,
  .dock-btn--active:focus-visible {
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    background: var(--button-bg);
    color: var(--button-text);
    box-shadow: var(--button-shadow);
  }

  /* Камера выключена — приглушаем */
  .dock-btn--off:not(.dock-btn--active) {
    color: #8a92a8;
  }

  /* Завершить — акцент-красный */
  .dock-btn--end {
    color: var(--danger);
  }
  .dock-btn--end:hover:not(:disabled),
  .dock-btn--end:focus-visible:not(:disabled) {
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
    background: color-mix(in srgb, var(--danger) 14%, transparent);
    color: var(--danger);
  }
  .dock-btn--end:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* Боковые панели — рядом по горизонтали (чат слева, подсказки правее) */
  .call-side {
    display: flex;
    flex-direction: row;
    flex: 0 0 auto;
    align-items: stretch;
    gap: 14px;
    min-height: 0;
    min-width: 0;
  }

  .side-panel {
    display: flex;
    flex-direction: column;
    width: clamp(320px, 24vw, 380px);
    min-width: 0;
    /* max-height: min(780px, calc(100dvh - 160px)); */
    height: calc(100vh - 32px);
    min-height: 0;
    padding: 14px;

    @media (max-width: 1365px) {
      height: auto;
    }
  }

  .side-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .side-head h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
  }

  .side-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
  }
  .side-close:hover {
    border-color: var(--glass-border-strong);
    color: var(--text-primary);
  }
  .side-close svg {
    width: 16px;
    height: 16px;
  }

  .side-panel .chat-feed {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    overflow-y: auto;
  }

  .composer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 0 0 auto;
    margin-top: auto;
    padding-top: 12px;
  }

  .composer textarea {
    width: 100%;
    min-height: 92px;
    max-height: 180px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
    color: var(--text-primary);
    padding: 10px 12px;
    resize: vertical;
    font: inherit;
  }

  .composer-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  /* Группа иконок-инструментов: Диктовать + голосовой разговор */
  .composer-tools {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Строка перехода к следующему вопросу */
  .next-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .next-row--suggest {
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .next-hint {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-secondary);
  }
  .next-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    background: var(--surface-raised);
    color: var(--text-primary);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
    transition: border-color var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }
  .next-btn svg {
    width: 15px;
    height: 15px;
  }
  .next-btn:hover:not(:disabled) {
    border-color: var(--glass-border-strong);
    transform: translateY(-1px);
  }
  .next-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }
  /* Когда ИИ предлагает перейти — кнопка акцентная и пульсирует. */
  .next-row--suggest .next-btn {
    border: 0;
    background: var(--button-bg);
    color: var(--button-text);
    box-shadow: var(--button-shadow);
    animation: next-pulse 1.6s ease-in-out infinite;
  }
  @keyframes next-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 35%, transparent);
    }
    50% {
      box-shadow: 0 0 0 7px transparent;
    }
  }

  /* Кнопка «Отправить» — иконка */
  .send-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 12px;
    background: var(--button-bg);
    color: var(--button-text);
    box-shadow: var(--button-shadow);
    cursor: pointer;
    transition: transform var(--motion-fast) var(--ease-out),
      opacity var(--motion-fast) var(--ease-out);
  }
  .send-btn svg {
    width: 18px;
    height: 18px;
  }
  .send-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .send-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .hints-pane {
    display: grid;
    align-content: start;
    gap: 14px;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  .hint-focus,
  .plan-disclosure {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    padding: 12px;
  }

  .hint-focus {
    display: grid;
    gap: 10px;
  }

  .hint-focus h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 17px;
    line-height: 1.35;
  }

  .plan-disclosure {
    color: var(--text-secondary);
  }

  .plan-disclosure summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    list-style: none;
  }

  .plan-disclosure summary::-webkit-details-marker {
    display: none;
  }

  .plan-disclosure summary::after {
    content: '+';
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-weight: 900;
  }

  .plan-disclosure[open] summary::after {
    content: '-';
  }

  .plan-disclosure summary span {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .plan-disclosure summary strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  .plan-disclosure .plan-list {
    margin-top: 12px;
  }

  /* Узкие desktop/tablet: панели уезжают вниз, без горизонтального скролла. */
  @media (max-width: 1365px) {
    .call {
      flex-direction: column;
      min-height: 0;
    }
    .call-stage {
      flex-basis: auto;
      min-width: 0;
    }
    .videos {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: none;
      min-height: clamp(220px, 34vh, 360px);
    }
    .call-side {
      flex-direction: column;
    }
    .side-panel {
      width: 100%;
      max-height: none;
      min-height: min(520px, 72dvh);
    }
  }

  /* Планшеты и мобилки: всё в один столбец, видео не растягиваем */
  @media (max-width: 760px) {
    .videos {
      grid-template-columns: 1fr;
      grid-auto-rows: minmax(180px, auto);
      min-height: 0;
    }
    .side-panel {
      min-height: min(480px, 70dvh);
    }
    .dock {
      gap: 4px;
    }
    .dock-btn {
      min-width: 56px;
      padding: 6px 8px;
    }
    .now-question {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'badge listen'
        'question question';
      align-items: start;
      padding: 12px;
    }
    .listen-mini {
      width: 38px;
      height: 38px;
    }
  }

  @media (max-width: 560px) {
    .dock-label {
      display: none;
    }
    .dock-btn {
      min-width: 48px;
      min-height: 48px;
      padding: 8px;
    }
  }

  /* Кнопка-шестерёнка на плитке интервьюера */
  .interviewer-settings {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.42);
    color: #fff;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition: background var(--motion-fast) var(--ease-out);
  }
  .interviewer-settings svg {
    width: 18px;
    height: 18px;
    transition: transform var(--motion-fast) var(--ease-out);
  }
  .interviewer-settings:hover {
    background: rgba(0, 0, 0, 0.62);
  }
  .interviewer-settings:hover svg {
    transform: rotate(30deg);
  }

  /* Модалка выбора интервьюера */
  .picker-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(6, 9, 18, 0.62);
    backdrop-filter: blur(3px);
  }

  .picker-modal {
    width: min(560px, 100%);
    max-height: min(86dvh, 720px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px;
    border-radius: var(--radius-md, 16px);
    background: var(--surface, #11151f);
  }

  .picker-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .picker-head h3 {
    margin: 0 0 4px;
    font-size: 17px;
    font-weight: 800;
  }
  .picker-head p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.4;
  }

  .picker-group {
    display: grid;
    gap: 10px;
  }
  .picker-group-label {
    margin: 0;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .picker-card {
    display: grid;
    gap: 8px;
    justify-items: center;
    padding: 10px;
    border: 1px solid var(--glass-border);
    border-radius: 14px;
    background: var(--surface-soft);
    color: var(--text-primary);
    cursor: pointer;
    transition: border-color var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }
  .picker-card:hover:not(:disabled) {
    border-color: var(--glass-border-strong);
    transform: translateY(-1px);
  }
  .picker-card:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .picker-card--active {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 50%, transparent);
  }

  .picker-thumb {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 12px;
    background: linear-gradient(135deg, #1c2738, #2c3a4f);
  }
  .picker-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .picker-initials {
    font-size: 26px;
    font-weight: 900;
    font-style: normal;
    color: rgba(255, 255, 255, 0.85);
  }

  .picker-mode {
    font-size: 13px;
    font-weight: 800;
  }

  @media (max-width: 480px) {
    .picker-grid {
      gap: 8px;
    }
    .picker-card {
      padding: 8px;
    }
    .picker-mode {
      font-size: 12px;
    }
  }
</style>

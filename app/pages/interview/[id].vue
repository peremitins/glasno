<script setup lang="ts">
  import {
    type ComponentPublicInstance,
    computed,
    nextTick,
    onBeforeUpdate,
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
    LearningTermContext,
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
  import ReportGenerationPanel from '@/app/components/interview/ReportGenerationPanel.vue';
  import { sanitizeProviderErrorMessage } from '@/app/utils/providerErrorMessage';
  import TextWithInterviewTerms from '@/app/components/design/TextWithInterviewTerms.vue';
  import AudioPermissionDeniedDialog from '@/app/components/audio/AudioPermissionDeniedDialog.vue';
  import CameraPermissionDeniedDialog from '@/app/components/camera/CameraPermissionDeniedDialog.vue';
  import MicPermissionDeniedDialog from '@/app/components/mic/MicPermissionDeniedDialog.vue';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import {
    RealtimeInterviewChatAdapter,
    REALTIME_QUESTION_ANNOUNCEMENT_KIND,
  } from '@/app/services/realtime/realtimeInterviewChatAdapter';
  import type { RealtimeVoiceControl } from '@/app/composables/useRealtimeVoiceSession';
  import { INTERVIEW_STREAM_MODE } from '@/app/constants/interview';
  import { getInterviewerFacePhotoSrc } from '@/app/utils/interviewerAssets';
  import {
    isNextQuestionTransitionReply,
    isNextQuestionVoiceCommand,
  } from '@/app/utils/interviewVoiceCommand';
  import { useRealtimeVoiceUiStore } from '@/app/stores/realtimeVoiceUi';
  import { resolveTtsVoiceForFace } from '@/shared/interviewerVoice';
  import { CSRF_COOKIE_NAME } from '@/shared/constants';
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
  const sessionAction = ref<'message' | 'next' | 'report' | null>(null);
  // Идёт ручная озвучка реплики/вопроса (по клику на иконку динамика).
  const isSpeakingQuestion = ref(false);
  // Какой пузырь чата сейчас озвучивается (для подсветки его иконки).
  const speakingMessageId = ref<string | null>(null);
  // Интервьюер говорит в realtime-режиме (WebRTC-аудио модели).
  const realtimeSpeaking = ref(false);
  // Кандидат сейчас говорит (по VAD realtime-сессии) — для амбиентной
  // подсветки нижней плитки «сейчас говорим мы».
  const userSpeaking = ref(false);
  // Первый вопрос уже озвучен после подключения (чтобы не дублировать).
  const firstQuestionAnnounced = ref(false);
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
  // Управление активной realtime-сессией (отмена ответа модели, отправка
  // событий) — выдаётся панелью RealtimeVoicePanel через onControl.
  const realtimeControl = ref<RealtimeVoiceControl | null>(null);
  let realtimePersistQueue: Promise<void> = Promise.resolve();
  // Runtime-пузыри, уже поставленные в очередь на сохранение: защита от
  // повторного персиста одной и той же реплики (дубли в истории диалога).
  const queuedRealtimePersistMessageIds = new Set<string>();

  function handleRealtimeControl(control: RealtimeVoiceControl | null) {
    realtimeControl.value = control;
  }

  const sessionId = computed(() => String(route.params.id || ''));

  const {
    data: state,
    pending,
    refresh,
  } = await useLazyAsyncData(
    () => `interview-${sessionId.value}`,
    () =>
      api<InterviewStateResponse>(`/api/interview/sessions/${sessionId.value}`)
  );

  const interviewerTtsVoice = computed(() =>
    resolveTtsVoiceForFace(state.value?.session.interviewerFaceId)
  );
  const sessionInitialPending = computed(() => pending.value && !state.value);
  const currentTurn = computed(() => state.value?.currentTurn ?? null);
  const isDone = computed(() => state.value?.session.status === 'done');
  const isLastQuestion = computed(() => {
    const session = state.value?.session;
    if (!session || isDone.value) return false;
    return session.currentQuestionIndex >= session.totalQuestions;
  });
  const nextActionLabel = computed(() =>
    isLastQuestion.value
      ? t('interview.session.finishInterview')
      : t('interview.session.nextQuestion')
  );
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
  const currentHintDetails = computed(
    () => currentHintPack.value?.detailed ?? null
  );
  type CurrentInterviewTurn = NonNullable<
    InterviewStateResponse['currentTurn']
  >;

  const currentHintsRequestKey = computed(() => {
    const turn = currentTurn.value;
    return turn ? hintRequestKeyForTurn(turn) : '';
  });

  function hintRequestKeyForTurn(turn: CurrentInterviewTurn) {
    return `${turn.id}:${
      latestInterviewerQuestionForHints(turn) || turn.question
    }`;
  }

  // Без turnId: он менялся каждым ходом, из-за чего контекст всех видимых
  // сообщений «обновлялся» и закрывал открытые объяснения. Для владения
  // и кэша ручного explain достаточно interviewSessionId.
  function learningTermContext(
    kind: LearningTermContext['kind'],
    label?: string
  ): LearningTermContext {
    return {
      kind,
      interviewSessionId: state.value?.session.id || sessionId.value,
      ...(label ? { label } : {}),
    };
  }

  function latestInterviewerQuestionForHints(
    turn: CurrentInterviewTurn
  ): string | null {
    for (let index = turn.messages.length - 1; index >= 0; index -= 1) {
      const message = turn.messages[index];
      if (!message) continue;
      if (message.role !== 'interviewer') continue;
      const question = extractQuestionPromptForHints(message.content);
      if (question && !isMoveOnQuestionForHints(question)) return question;
    }
    return null;
  }

  function extractQuestionPromptForHints(content: string): string | null {
    const normalized = content.replace(/\s+/g, ' ').trim();
    const questionEnd = normalized.lastIndexOf('?');
    if (questionEnd < 0) return null;

    const prefix = normalized.slice(0, questionEnd);
    const boundary = Math.max(
      prefix.lastIndexOf('.'),
      prefix.lastIndexOf('!'),
      prefix.lastIndexOf('?')
    );
    const question = normalized.slice(boundary + 1, questionEnd + 1).trim();
    return question || null;
  }

  function isMoveOnQuestionForHints(question: string): boolean {
    return /следующ[а-яё]*\s+вопрос|перей[а-яё]*\s+(?:к|ко)\s+следующ|дальше/iu.test(
      question
    );
  }

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
        userSpeaking.value = false;
        firstQuestionAnnounced.value = false;
        return;
      }
      // Соединение установлено: модель сама здоровается и озвучивает текущий
      // вопрос — чтобы кандидат понял, что можно отвечать (без «немой» паузы).
      if (firstQuestionAnnounced.value) return;
      firstQuestionAnnounced.value = true;
      void nextTick(() =>
        announceCurrentQuestionViaRealtime({ firstQuestion: true })
      );
    }
  );

  function extractApiError(error: unknown): string {
    const fallback = t('interview.common.unknownError');
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data?: { error?: { message?: string } } }).data;
      return sanitizeProviderErrorMessage(data?.error?.message, fallback);
    }
    return sanitizeProviderErrorMessage(
      error instanceof Error ? error.message : '',
      fallback
    );
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
      onUserTranscriptCompleted(transcript, messageId) {
        handleRealtimeTranscript(transcript, messageId);
      },
      onAssistantTranscriptCompleted(transcript, messageId) {
        handleRealtimeAssistantTranscript(transcript, messageId);
      },
      onUserTranscriptFailed() {
        // Текст реплики распознать не удалось, но аудио уже в контексте
        // модели — явно просим интервьюера ответить, чтобы диалог не замер
        // (авто-ответ VAD выключен, см. realtimeConfig).
        realtimeControl.value?.sendEvent({ type: 'response.create' });
      },
      onAssistantSpeechStarted() {
        realtimeSpeaking.value = true;
      },
      onAssistantSpeechEnded() {
        realtimeSpeaking.value = false;
      },
      onUserSpeechStarted() {
        userSpeaking.value = true;
      },
      onUserSpeechEnded() {
        userSpeaking.value = false;
      },
    });
    return realtimeAdapter.value;
  }

  function handleRealtimeEvent(event: unknown) {
    if (!event || typeof event !== 'object') return;
    ensureRealtimeAdapter().handleServerEvent(event as { type?: string });
  }

  function handleRealtimeTranscript(transcript: string, messageId?: string) {
    const normalized = transcript.trim();
    if (!normalized) return;
    // В realtime реплики кандидата уже попадают в чат через адаптер.
    // В поле ответа ничего НЕ пишем. По голосовой команде — переходим дальше.
    if (isNextQuestionVoiceCommand(normalized)) {
      // Команда адресована приложению, а не интервьюеру. Авто-ответ VAD
      // выключен, поэтому модель на команду голосом не реагирует вовсе;
      // cancel — страховка, если она ещё договаривает прошлый ответ.
      realtimeControl.value?.cancelActiveResponses();
      void goToNextQuestion();
      return;
    }
    queueRealtimeDialogueMessage('user', normalized, messageId);
    // Обычная реплика кандидата: явно запускаем ответ интервьюера — теперь
    // это делаем мы (после анализа транскрипта), а не VAD автоматически.
    realtimeControl.value?.sendEvent({ type: 'response.create' });
  }

  function handleRealtimeAssistantTranscript(
    transcript: string,
    messageId: string
  ) {
    queueRealtimeDialogueMessage('interviewer', transcript, messageId);
    if (isNextQuestionTransitionReply(transcript)) {
      void goToNextQuestion();
    }
  }

  // Озвучивает только что переключённый вопрос голосом интервьюера в ТОЙ ЖЕ
  // realtime-сессии (без переподключения): добавляем модели контекст о смене
  // вопроса и просим произнести его. В чат этот ответ не дублируется —
  // вопрос уже показан отдельным пузырём.
  function announceCurrentQuestionViaRealtime(
    options: { firstQuestion?: boolean } = {}
  ) {
    const control = realtimeControl.value;
    const question = currentTurn.value?.question?.trim();
    if (!control || !voiceConnected.value || !question) return;

    // На случай, если модель всё ещё договаривает что-то по старому вопросу.
    control.cancelActiveResponses();

    const contextText = options.firstQuestion
      ? `Интервью началось. Текущий вопрос: «${question}». Обсуждай только его.`
      : `Приложение переключило интервью на следующий вопрос. Текущий вопрос теперь: «${question}». ` +
        'Обсуждай только его и не возвращайся к предыдущему вопросу.';

    const instructions = options.firstQuestion
      ? `Коротко поздоровайся с кандидатом одной фразой (например, «Здравствуйте, давайте начнём») и сразу задай первый вопрос интервью дословно: «${question}». ` +
        'Ничего не добавляй после вопроса.'
      : `Озвучь кандидату следующий вопрос интервью дословно: «${question}». ` +
        'Перед вопросом допустима только короткая связка вроде «Хорошо, следующий вопрос». ' +
        'Ничего не добавляй после вопроса.';

    control.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text: contextText }],
      },
    });
    control.sendEvent({
      type: 'response.create',
      response: {
        metadata: { glasno_kind: REALTIME_QUESTION_ANNOUNCEMENT_KIND },
        instructions,
      },
    });
  }

  const suggestMoveOn = computed(
    () => currentTurn.value?.suggestMoveOn === true
  );

  function queueRealtimeDialogueMessage(
    role: InterviewDialogueRole,
    content: string,
    runtimeMessageId?: string
  ) {
    const turn = currentTurn.value;
    const normalized = content.trim();
    if (!turn || !normalized) return;

    // Одна реплика — один персист. Повторные события по тому же пузырю
    // (ретрансляции транскрипта и т.п.) не должны дублировать сообщение
    // в истории диалога.
    if (runtimeMessageId) {
      if (queuedRealtimePersistMessageIds.has(runtimeMessageId)) return;
      queuedRealtimePersistMessageIds.add(runtimeMessageId);
    }

    realtimePersistQueue = realtimePersistQueue
      .then(() =>
        persistRealtimeDialogueMessage(
          turn.id,
          role,
          normalized,
          runtimeMessageId
        )
      )
      .catch((err) => {
        errorMessage.value = extractApiError(err);
      });
  }

  async function persistRealtimeDialogueMessage(
    turnId: string,
    role: InterviewDialogueRole,
    content: string,
    runtimeMessageId?: string
  ) {
    state.value = await api<InterviewStateResponse>(
      `/api/interview/sessions/${sessionId.value}/dialogue`,
      {
        method: 'POST',
        body: { turnId, role, content },
      }
    );
    // Реплика теперь отрисовывается из состояния интервью (turn.messages) —
    // снимаем её оптимистичный runtime-пузырь, иначе в чате будет дубль.
    if (runtimeMessageId) {
      runtimeMessages.value = runtimeMessages.value.filter(
        (message) => message.id !== runtimeMessageId
      );
    }
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
    sessionAction.value = 'message';
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
      sessionAction.value = null;
    }
  }

  function handleComposerKeydown(event: KeyboardEvent) {
    if (event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void sendMessage();
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
    const prefix = `${CSRF_COOKIE_NAME}=`;
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
    if (!turn || isSending.value || isGeneratingReport.value) return;

    if (isLastQuestion.value) {
      await finishInterviewFromCurrentQuestion(turn);
      return;
    }

    isSending.value = true;
    sessionAction.value = 'next';
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
      // В голосовом режиме новый вопрос сразу озвучивается в текущем
      // realtime-соединении — без переподключения и без действий пользователя.
      announceCurrentQuestionViaRealtime();
    } catch (err) {
      errorMessage.value = extractApiError(err);
    } finally {
      isSending.value = false;
      sessionAction.value = null;
    }
  }

  async function finishInterviewFromCurrentQuestion(
    turn: CurrentInterviewTurn
  ) {
    if (isSending.value || isGeneratingReport.value) return;

    isSending.value = true;
    sessionAction.value = 'next';
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
      await generateReport({ skipFlush: true });
    } catch (err) {
      errorMessage.value = extractApiError(err);
    } finally {
      isSending.value = false;
      sessionAction.value = null;
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

  async function generateReport(options: { skipFlush?: boolean } = {}) {
    if (!state.value?.session.id || isGeneratingReport.value) return;

    const ownsReportButtonState =
      !options.skipFlush && sessionAction.value !== 'next';
    if (ownsReportButtonState) {
      sessionAction.value = 'report';
    }
    isGeneratingReport.value = true;
    errorMessage.value = '';
    try {
      if (!options.skipFlush) {
        await flushRealtimePersistence();
      }
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
      if (ownsReportButtonState) {
        sessionAction.value = null;
      }
    }
  }

  const reportGenerationAutoStarted = ref(false);

  function startReportGenerationOnce() {
    if (!isDone.value || reportGenerationAutoStarted.value) return;
    reportGenerationAutoStarted.value = true;
    void generateReport();
  }

  watch(isDone, (done) => {
    if (done) startReportGenerationOnce();
  });

  // --- Выбор интервьюера (внешность + тон) прямо в кабинете ---
  // Лицо кодирует пол и тон; выбор меняет и фото, и манеру ИИ на лету.
  const interviewerPickerOpen = ref(false);
  const isChangingInterviewer = ref(false);
  const changingInterviewerFaceId = ref<InterviewerFaceId | null>(null);
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
    changingInterviewerFaceId.value = faceId;
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
      changingInterviewerFaceId.value = null;
    }
  }

  // --- Режим видеозвонка: полный экран, камера, скрываемые панели ---
  const isFullscreen = ref(false);
  const cameraEnabled = ref(false); // по умолчанию камера выключена, как в Zoom
  const cameraLive = ref(false);
  const chatOpen = ref(true); // боковой чат
  const hintsOpen = ref(false); // боковые подсказки
  const hintsLoading = ref(false);
  const hintsError = ref('');
  const hintsPane = ref<HTMLElement | null>(null);
  const hintDetailsPanels = ref<HTMLElement[]>([]);
  const loadedHintRequestKeys = ref<Set<string>>(new Set());
  const hintsInitialLoading = computed(
    () => hintsLoading.value && !currentHintDetails.value
  );
  const hintsSampleRefreshing = computed(
    () => hintsLoading.value && Boolean(currentHintDetails.value)
  );

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
    if (hintsOpen.value) {
      void generateHintsForCurrentTurn();
    }
  }

  function scrollHintsToTop(behavior: ScrollBehavior = 'smooth') {
    hintsPane.value?.scrollTo({ top: 0, behavior });
    for (const panel of hintDetailsPanels.value) {
      panel.scrollTo({ top: 0, behavior });
    }
  }

  onBeforeUpdate(() => {
    hintDetailsPanels.value = [];
  });

  function setHintDetailsPanelRef(
    element: Element | ComponentPublicInstance | null
  ) {
    if (!(element instanceof HTMLElement)) return;
    hintDetailsPanels.value.push(element);
  }

  async function generateHintsForCurrentTurn(force = false) {
    const turn = currentTurn.value;
    if (!turn || hintsLoading.value) return;
    const requestKey = currentHintsRequestKey.value;
    const latestInterviewerQuestion = latestInterviewerQuestionForHints(turn);
    const sampleAnswerQuestion = latestInterviewerQuestion || turn.question;
    if (
      turn.hintPack?.detailed &&
      (!latestInterviewerQuestion ||
        turn.hintPack.detailed.sampleAnswerQuestion === sampleAnswerQuestion)
    ) {
      loadedHintRequestKeys.value = new Set(loadedHintRequestKeys.value).add(
        requestKey
      );
      hintsError.value = '';
      return;
    }
    if (!force && loadedHintRequestKeys.value.has(requestKey)) return;

    hintsLoading.value = true;
    hintsError.value = '';
    try {
      state.value = await api<InterviewStateResponse>(
        `/api/interview/sessions/${sessionId.value}/hints`,
        {
          method: 'POST',
          body: { turnId: turn.id },
        }
      );
      loadedHintRequestKeys.value = new Set(loadedHintRequestKeys.value).add(
        requestKey
      );
      await nextTick();
      scrollHintsToTop('auto');
    } catch (err) {
      hintsError.value = extractApiError(err);
    } finally {
      hintsLoading.value = false;
    }
  }

  function retryHints() {
    const turn = currentTurn.value;
    if (!turn) return;
    const next = new Set(loadedHintRequestKeys.value);
    next.delete(currentHintsRequestKey.value);
    loadedHintRequestKeys.value = next;
    void generateHintsForCurrentTurn(true);
  }

  watch(
    () => currentHintsRequestKey.value,
    () => {
      if (hintsOpen.value) {
        scrollHintsToTop('auto');
        void generateHintsForCurrentTurn();
      }
    }
  );

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
    startReportGenerationOnce();
    // При входе сразу показываем последние сообщения.
    void nextTick(() => scrollChatToBottom('auto'));
  });
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    stopSpeech();
  });
</script>

<template>
  <div class="interview-session-page app-page">
    <header class="session-compact-header glass-frame glass-frame--soft">
      <p class="session-compact-meta">{{ progressText }}</p>
      <h1 class="session-compact-title">
        {{
          state?.session.vacancyTitle ||
          state?.session.role ||
          t('interview.session.title')
        }}
      </h1>
    </header>

    <GlassSkeletonStack
      v-if="sessionInitialPending"
      class="session-skeleton"
      :heights="[420, 180, 140]"
    />

    <template v-else-if="state">
      <ReportGenerationPanel
        v-if="isDone"
        :error-message="errorMessage"
        :retry-loading="sessionAction === 'report'"
        @retry="generateReport"
      />

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
            <div
              class="vtile vtile--peer"
              :class="{ 'vtile--speaking': isInterviewerSpeaking }"
            >
              <InterviewerCard
                :avatar-id="state.session.interviewerAvatarId"
                :mode="state.session.interviewerMode"
                :face-id="state.session.interviewerFaceId"
                :is-speaking="isInterviewerSpeaking"
              />
              <button
                v-tooltip="t('interview.session.interviewerPicker.open')"
                class="interviewer-settings"
                type="button"
                :aria-label="t('interview.session.interviewerPicker.open')"
                @click="interviewerPickerOpen = true"
              >
                <GearIcon aria-hidden="true" />
              </button>
            </div>
            <!-- Кандидат снизу -->
            <div
              class="vtile vtile--self"
              :class="{ 'vtile--user-speaking': userSpeaking }"
            >
              <LocalCameraPreview
                :active="cameraEnabled"
                @active-change="handleCameraActiveChange"
                @start-failed="handleCameraStartFailed"
              />
              <span class="vtile-name">{{ t('interview.session.you') }}</span>
              <!-- «Можно говорить» — у того, кто проходит собеседование.
                   Показываем, когда голосовое соединение установлено; при речи
                   меняем текст на «Говорит» (плюс амбиентная подсветка рамки). -->
              <span
                v-if="voiceConnected"
                class="vtile-voice-tag"
                :class="{ 'vtile-voice-tag--speaking': userSpeaking }"
                role="status"
                aria-live="polite"
              >
                <span class="vtile-voice-dot" aria-hidden="true" />
                {{
                  userSpeaking
                    ? t('interview.session.stage.speaking')
                    : t('voice.realtime.readyToSpeak')
                }}
              </span>
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
            <p>
              <TextWithInterviewTerms
                :text="currentTurn.question"
                :context="learningTermContext('interview_question')"
                manual-selection
              />
            </p>
            <button
              v-if="isTtsEnabled"
              v-tooltip="t('voice.tts.listen')"
              class="listen-mini"
              type="button"
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
              v-tooltip="t('interview.session.controls.cameraTip')"
              class="dock-btn"
              :class="{
                'dock-btn--active': cameraLive,
                'dock-btn--off': !cameraLive,
              }"
              type="button"
              @click="toggleCamera"
            >
              <VideoIcon aria-hidden="true" />
              <span class="dock-label">{{
                t('interview.session.controls.camera')
              }}</span>
            </button>

            <button
              v-tooltip="t('interview.session.controls.chatTip')"
              class="dock-btn"
              :class="{ 'dock-btn--active': chatOpen }"
              type="button"
              @click="toggleChat"
            >
              <ChatBubbleIcon aria-hidden="true" />
              <span class="dock-label">{{
                t('interview.session.tabs.chat')
              }}</span>
            </button>

            <button
              v-tooltip="t('interview.session.controls.hintsTip')"
              class="dock-btn"
              :class="{ 'dock-btn--active': hintsOpen }"
              type="button"
              @click="toggleHints"
            >
              <LightningBoltIcon aria-hidden="true" />
              <span class="dock-label">{{
                t('interview.session.tabs.hints')
              }}</span>
            </button>

            <button
              v-tooltip="
                isFullscreen
                  ? t('interview.session.controls.exitFs')
                  : t('interview.session.controls.enterFs')
              "
              class="dock-btn"
              :class="{ 'dock-btn--active': isFullscreen }"
              type="button"
              @click="toggleFullscreen"
            >
              <ExitFullScreenIcon v-if="isFullscreen" aria-hidden="true" />
              <EnterFullScreenIcon v-else aria-hidden="true" />
              <span class="dock-label">{{
                t('interview.session.controls.screen')
              }}</span>
            </button>

            <button
              v-tooltip="t('interview.session.controls.end')"
              class="dock-btn dock-btn--end button-loader-host"
              type="button"
              :disabled="isGeneratingReport"
              @click="endInterview"
            >
              <ButtonLoader v-if="sessionAction === 'report'" />
              <span
                class="button-loader-content dock-btn__content"
                :class="{
                  'button-loader-content--loading': sessionAction === 'report',
                }"
              >
                <ExitIcon aria-hidden="true" />
                <span class="dock-label">{{
                  t('interview.session.controls.endShort')
                }}</span>
              </span>
            </button>
          </div>
        </div>

        <!-- Боковые панели: чат и подсказки (скрываемые, независимые) -->
        <div v-if="chatOpen || hintsOpen" class="call-side">
          <aside v-if="chatOpen" class="side-panel glass-frame">
            <header class="side-head side-head--chat">
              <h3>{{ t('interview.session.tabs.chat') }}</h3>
              <!-- Компактный индикатор соединения — по центру шапки чата,
                   помещается даже на 320px. «Можно говорить» живёт на плитке
                   кандидата, здесь только статус связи. -->
              <span
                v-if="voiceConnecting || voiceConnected"
                class="chat-conn"
                :class="{
                  'chat-conn--connecting': voiceConnecting,
                  'chat-conn--ready': voiceConnected,
                }"
                role="status"
                aria-live="polite"
              >
                <span class="chat-conn-dot" aria-hidden="true" />
                <span class="chat-conn-text">{{
                  voiceConnected
                    ? t('voice.realtime.connectedBadge')
                    : t('voice.realtime.status.connecting')
                }}</span>
              </span>
              <button
                v-tooltip="t('interview.session.controls.hidePanel')"
                class="side-close"
                type="button"
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
                <p>
                  <TextWithInterviewTerms
                    :text="message.content"
                    :context="
                      learningTermContext('interview_message', message.meta)
                    "
                    manual-selection
                  />
                </p>
                <button
                  v-if="isTtsEnabled && message.role === 'assistant'"
                  v-tooltip="
                    speakingMessageId === message.id
                      ? t('voice.tts.stop')
                      : t('voice.tts.listen')
                  "
                  class="bubble-listen"
                  :class="{
                    'bubble-listen--active': speakingMessageId === message.id,
                  }"
                  type="button"
                  :disabled="realtimeVoiceLocked"
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
                class="next-btn button-loader-host"
                type="button"
                :disabled="isSending || isGeneratingReport"
                @click="goToNextQuestion"
              >
                <ButtonLoader v-if="sessionAction === 'next'" />
                <span
                  class="button-loader-content"
                  :class="{
                    'button-loader-content--loading': sessionAction === 'next',
                  }"
                >
                  {{ nextActionLabel }}
                  <ExitIcon v-if="isLastQuestion" aria-hidden="true" />
                  <ArrowRightIcon v-else aria-hidden="true" />
                </span>
              </button>
            </div>

            <form class="composer" @submit.prevent="sendMessage">
              <textarea
                id="answer"
                v-model="answer"
                rows="3"
                :disabled="isSending || realtimeVoiceLocked"
                :placeholder="t('interview.session.replyPlaceholder')"
                @keydown.enter="handleComposerKeydown"
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
                    :on-control="handleRealtimeControl"
                  />
                </div>
                <button
                  v-tooltip="t('interview.session.send')"
                  class="send-btn button-loader-host"
                  type="submit"
                  :disabled="
                    answer.trim().length < 1 || isSending || realtimeVoiceLocked
                  "
                  :aria-label="t('interview.session.send')"
                >
                  <ButtonLoader v-if="sessionAction === 'message'" />
                  <span
                    class="button-loader-content"
                    :class="{
                      'button-loader-content--loading':
                        sessionAction === 'message',
                    }"
                  >
                    <PaperPlaneIcon aria-hidden="true" />
                  </span>
                </button>
              </div>
            </form>
          </aside>

          <aside v-if="hintsOpen" class="side-panel glass-frame">
            <header class="side-head">
              <h3>{{ t('interview.session.tabs.hints') }}</h3>
              <button
                v-tooltip="t('interview.session.controls.hidePanel')"
                class="side-close"
                type="button"
                @click="toggleHints"
              >
                <Cross2Icon aria-hidden="true" />
              </button>
            </header>

            <div ref="hintsPane" class="hints-pane">
              <template v-if="hintsInitialLoading">
                <p class="sr-only">
                  {{ t('interview.session.hintsPanel.loading') }}
                </p>
                <GlassSkeletonStack :heights="[42, 118, 196, 132]" />
              </template>

              <template v-else>
                <div v-if="hintsError" class="hint-error">
                  <p>{{ hintsError }}</p>
                  <button type="button" class="hint-retry" @click="retryHints">
                    {{ t('interview.session.hintsPanel.retry') }}
                  </button>
                </div>

                <details
                  v-if="currentHintPack || currentHintDetails"
                  :ref="setHintDetailsPanelRef"
                  class="hint-disclosure hint-disclosure--primary"
                  open
                >
                  <summary>
                    <span>
                      <em class="coach-label">{{
                        t('interview.session.hints')
                      }}</em>
                      <strong>{{
                        t('interview.session.hintsPanel.answerPlan')
                      }}</strong>
                    </span>
                  </summary>

                  <div class="hint-body">
                    <h3 v-if="currentHintDetails?.focus">
                      <TextWithInterviewTerms
                        :text="currentHintDetails.focus"
                        :context="learningTermContext('interview_hint')"
                        manual-selection
                      />
                    </h3>
                    <p v-else class="hint-structure">
                      <TextWithInterviewTerms
                        :text="
                          currentHintPack?.strongDirection ||
                          t('interview.session.noHints')
                        "
                        :context="learningTermContext('interview_hint')"
                        manual-selection
                      />
                    </p>

                    <ul
                      v-if="currentHintDetails?.answerPlan.length"
                      class="hint-list"
                    >
                      <li
                        v-for="item in currentHintDetails.answerPlan"
                        :key="item"
                      >
                        <TextWithInterviewTerms
                          :text="item"
                          :context="learningTermContext('interview_hint')"
                          manual-selection
                        />
                      </li>
                    </ul>

                    <template v-if="currentHintDetails?.keyDefinitions.length">
                      <p class="hint-subtitle">
                        {{ t('interview.session.hintsPanel.keyDefinitions') }}
                      </p>
                      <ul class="hint-list">
                        <li
                          v-for="item in currentHintDetails.keyDefinitions"
                          :key="item"
                        >
                          <TextWithInterviewTerms
                            :text="item"
                            :context="learningTermContext('interview_hint')"
                            manual-selection
                          />
                        </li>
                      </ul>
                    </template>

                    <template v-if="currentHintPack">
                      <p class="hint-subtitle">
                        {{ t('interview.session.hintsPanel.answerStructure') }}
                      </p>
                      <p class="hint-structure">
                        <TextWithInterviewTerms
                          :text="currentHintPack.structure"
                          :context="learningTermContext('interview_hint')"
                          manual-selection
                        />
                      </p>
                      <ul class="hint-list">
                        <li v-for="item in currentHintPack.bullets" :key="item">
                          <TextWithInterviewTerms
                            :text="item"
                            :context="learningTermContext('interview_hint')"
                            manual-selection
                          />
                        </li>
                      </ul>
                    </template>

                    <template v-if="currentHintPack?.avoid.length">
                      <p class="hint-subtitle">
                        {{ t('interview.session.hintsPanel.avoid') }}
                      </p>
                      <ul class="hint-list hint-list--avoid">
                        <li v-for="item in currentHintPack.avoid" :key="item">
                          <TextWithInterviewTerms
                            :text="item"
                            :context="learningTermContext('interview_hint')"
                            manual-selection
                          />
                        </li>
                      </ul>
                    </template>
                  </div>
                </details>

                <p v-else class="hint-status">
                  <TextWithInterviewTerms
                    :text="t('interview.session.noHints')"
                    :context="learningTermContext('interview_hint')"
                    manual-selection
                  />
                </p>

                <details
                  v-if="currentHintDetails?.sampleAnswer"
                  :ref="setHintDetailsPanelRef"
                  class="hint-disclosure"
                  open
                >
                  <summary>
                    <span>
                      <em class="coach-label">
                        {{
                          t('interview.session.hintsPanel.sampleAnswerLabel')
                        }}
                      </em>
                      <strong>{{
                        t('interview.session.hintsPanel.sampleAnswer')
                      }}</strong>
                    </span>
                  </summary>
                  <p
                    class="hint-sample"
                    :class="{
                      'hint-sample--refreshing': hintsSampleRefreshing,
                    }"
                  >
                    <TextWithInterviewTerms
                      :text="currentHintDetails.sampleAnswer"
                      :context="learningTermContext('interview_hint')"
                      manual-selection
                    />
                  </p>
                </details>
              </template>

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
                      <TextWithInterviewTerms
                        :text="
                          item.question ||
                          t('interview.session.plannedGlasnoQuestion')
                        "
                        :context="
                          learningTermContext(
                            'interview_question',
                            'План интервью'
                          )
                        "
                        manual-selection
                      />
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
              class="picker-card button-loader-host"
              :class="{
                'picker-card--active':
                  state.session.interviewerFaceId === opt.id,
              }"
              :disabled="isChangingInterviewer"
              @click="changeInterviewer(opt.id)"
            >
              <ButtonLoader v-if="changingInterviewerFaceId === opt.id" />
              <span
                class="button-loader-content picker-card__content"
                :class="{
                  'button-loader-content--loading':
                    changingInterviewerFaceId === opt.id,
                }"
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
              </span>
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
  .interview-session-page {
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 1.6vw, 16px);
    min-width: 0;
  }

  .session-compact-header {
    display: grid;
    gap: 6px;
    min-width: 0;
    padding: clamp(12px, 1.4vw, 16px) clamp(16px, 2vw, 22px);
  }

  .session-compact-meta,
  .session-compact-title {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .session-compact-meta {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: clamp(11px, 1vw, 13px);
    font-weight: 900;
    letter-spacing: 0;
    line-height: 1.35;
    text-transform: uppercase;
  }

  .session-compact-title {
    color: var(--text-primary);
    font-size: clamp(20px, 2vw, 28px);
    font-weight: 900;
    line-height: 1.08;
  }

  .panel {
    padding: clamp(8px, 2.2vw, 26px);
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
    gap: clamp(12px, 1.6vw, 16px);
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
    font-size: clamp(17px, 1.6vw, 22px);
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
    width: fit-content;
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

  .plan-list li > span {
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
  .error {
    margin: 0;
    color: var(--danger);
    font-weight: 700;
  }
  @media (max-width: 640px) {
    .panel {
      padding: 15px;
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
    gap: clamp(12px, 1.6vw, 16px);
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
    background: var(--app-bg);
  }

  /* Сцена с видео */
  .call-stage {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: clamp(12px, 1.6vw, 16px);
    min-width: min(100%, 220px);
  }

  .videos {
    display: grid;
    grid-template-rows: 1.35fr 1fr;
    gap: clamp(12px, 1.6vw, 16px);
    flex: 1;
    min-height: 360px;
  }

  .vtile {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    border-radius: clamp(12px, 1.6vw, var(--radius-lg));
    background: var(--surface-solid);
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
    background: color-mix(in srgb, var(--app-bg) 72%, transparent);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  /* Компактный индикатор соединения — по центру шапки чата (влезает на 320px). */
  .chat-conn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-self: center;
    min-width: 0;
    max-width: 100%;
    padding: 4px 10px;
    border: 1px solid var(--glass-border-strong);
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
    line-height: 1.1;
    white-space: nowrap;
  }
  .chat-conn-dot {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: currentColor;
  }
  .chat-conn-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chat-conn--connecting {
    color: color-mix(in srgb, var(--accent-2) 62%, #d9a83f);
    border-color: color-mix(in srgb, #f0c15a 45%, transparent);
  }
  .chat-conn--connecting .chat-conn-dot {
    animation: conn-pulse 1s ease-in-out infinite;
  }
  .chat-conn--ready {
    color: #2fb572;
    border-color: color-mix(in srgb, #45d483 50%, transparent);
    background: color-mix(in srgb, #45d483 12%, var(--surface-soft));
  }
  .chat-conn--ready .chat-conn-dot {
    box-shadow: 0 0 0 0 color-mix(in srgb, #45d483 70%, transparent);
    animation: conn-ready-dot 1.8s ease-in-out infinite;
  }

  @keyframes conn-pulse {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(0.82);
    }
    50% {
      opacity: 1;
      transform: scale(1.15);
    }
  }
  @keyframes conn-ready-dot {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, #45d483 70%, transparent);
    }
    70% {
      box-shadow: 0 0 0 7px transparent;
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }

  /* ===== Амбиентная подсветка «кто сейчас говорит» ===== */
  /* Плитка мягко светится по всей рамке того, чья очередь звучать. */
  .vtile {
    transition: box-shadow 0.35s var(--ease-out),
      border-color 0.35s var(--ease-out);
  }

  /* Говорит интервьюер — голубое амбиентное свечение вокруг верхней плитки. */
  .vtile--speaking {
    border-color: color-mix(in srgb, #7ab4ff 70%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, #7ab4ff 55%, transparent),
      0 0 34px 4px rgba(120, 180, 255, 0.34),
      0 0 70px 12px rgba(120, 180, 255, 0.22);
    animation: vtile-ambient-peer 2.6s ease-in-out infinite;
  }

  /* Говорит кандидат — тёплое амбиентное свечение вокруг нижней плитки. */
  .vtile--user-speaking {
    border-color: color-mix(in srgb, #45d483 68%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, #45d483 52%, transparent),
      0 0 34px 4px rgba(45, 212, 131, 0.32),
      0 0 70px 12px rgba(45, 212, 131, 0.2);
    animation: vtile-ambient-self 2.4s ease-in-out infinite;
  }

  @keyframes vtile-ambient-peer {
    0%,
    100% {
      box-shadow: 0 0 0 1px color-mix(in srgb, #7ab4ff 45%, transparent),
        0 0 28px 3px rgba(120, 180, 255, 0.26),
        0 0 60px 10px rgba(120, 180, 255, 0.16);
    }
    50% {
      box-shadow: 0 0 0 1px color-mix(in srgb, #7ab4ff 70%, transparent),
        0 0 40px 6px rgba(120, 180, 255, 0.42),
        0 0 84px 16px rgba(120, 180, 255, 0.26);
    }
  }
  @keyframes vtile-ambient-self {
    0%,
    100% {
      box-shadow: 0 0 0 1px color-mix(in srgb, #45d483 42%, transparent),
        0 0 28px 3px rgba(45, 212, 131, 0.24),
        0 0 60px 10px rgba(45, 212, 131, 0.14);
    }
    50% {
      box-shadow: 0 0 0 1px color-mix(in srgb, #45d483 68%, transparent),
        0 0 40px 6px rgba(45, 212, 131, 0.4),
        0 0 84px 16px rgba(45, 212, 131, 0.24);
    }
  }

  /* Шильдик «Можно говорить»/«Говорит» на плитке кандидата (нижняя плитка). */
  .vtile-voice-tag {
    position: absolute;
    left: 12px;
    top: 12px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: calc(100% - 24px);
    padding: 6px 11px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, #45d483 55%, transparent);
    background: color-mix(in srgb, #103021 74%, transparent);
    color: #bff6d5;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.01em;
    backdrop-filter: blur(5px);
    white-space: nowrap;
  }
  .vtile-voice-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #45d483;
    box-shadow: 0 0 0 0 color-mix(in srgb, #45d483 70%, transparent);
    animation: conn-ready-dot 1.8s ease-in-out infinite;
  }
  .vtile-voice-tag--speaking {
    border-color: color-mix(in srgb, #45d483 80%, transparent);
    box-shadow: 0 6px 22px rgba(45, 212, 131, 0.32);
  }

  @media (prefers-reduced-motion: reduce) {
    .vtile--speaking,
    .vtile--user-speaking,
    .chat-conn--connecting .chat-conn-dot,
    .chat-conn--ready .chat-conn-dot,
    .vtile-voice-dot {
      animation: none;
    }
  }

  /* Текущий вопрос */
  .now-question {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'badge .'
      'question listen';
    align-items: start;
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
    font-size: clamp(14px, 1.15vw, 16px);
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
    border-radius: clamp(12px, 1.6vw, var(--rad ius-lg));
    background: rgba(248, 250, 255, 0.96);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 10px 34px rgba(23, 31, 56, 0.08); */
    color: var(--text-primary);
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
    color: var(--text-muted);
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

  .dock-btn__content {
    flex-direction: column;
    gap: 4px;
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
    background: var(--surface-raised);
    color: var(--text-primary);
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
    color: var(--text-muted);
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

  /* Шапка чата: заголовок слева, индикатор соединения по центру, крестик
     справа. Grid держит индикатор ровно посередине и не даёт ему распирать
     шапку — влезает даже на 320px. */
  .side-head--chat {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
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

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .hint-disclosure,
  .plan-disclosure {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    max-height: 300px;
    overflow: auto;
    padding: 12px;
  }

  .hint-disclosure {
    color: var(--text-secondary);
  }

  .hint-disclosure--primary {
    background: color-mix(in srgb, var(--surface-soft) 88%, transparent);
  }

  .hint-body {
    display: grid;
    gap: 10px;
    margin-top: 12px;
  }

  .hint-body h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 17px;
    line-height: 1.35;
  }

  .hint-status,
  .hint-structure,
  .hint-error p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .hint-sample {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .hint-error {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid color-mix(in srgb, var(--danger) 34%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }

  .hint-retry {
    justify-self: start;
    min-height: 32px;
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    background: var(--surface-raised);
    color: var(--text-primary);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    padding: 0 10px;
  }

  .hint-subtitle {
    margin: 2px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 800;
  }

  .hint-disclosure .hint-list,
  .hint-disclosure .hint-structure,
  .hint-disclosure .hint-sample {
    /* margin-top: 12px; */
  }

  .hint-sample--refreshing {
    color: transparent;
    background-image: linear-gradient(
      115deg,
      var(--text-muted) 0%,
      var(--text-secondary) 38%,
      var(--text-primary) 50%,
      var(--text-secondary) 62%,
      var(--text-muted) 100%
    );
    background-size: 260% 100%;
    background-position: 140% 0;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: hint-text-shimmer 2.45s linear infinite;
  }

  .hint-sample--refreshing :deep(.term-tooltip) {
    color: transparent;
    background-image: inherit;
    background-size: inherit;
    background-position: 140% 0;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: hint-text-shimmer 2.45s linear infinite;
  }

  @keyframes hint-text-shimmer {
    from {
      background-position: 140% 0;
    }
    to {
      background-position: -140% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hint-sample--refreshing,
    .hint-sample--refreshing :deep(.term-tooltip) {
      animation: none;
      background-image: none;
      -webkit-text-fill-color: currentColor;
    }

    .hint-sample--refreshing {
      color: var(--text-secondary);
    }

    .hint-sample--refreshing :deep(.term-tooltip) {
      color: var(--accent-2);
    }
  }

  .hint-list--avoid li {
    color: var(--text-muted);
  }

  .plan-disclosure {
    color: var(--text-secondary);
  }

  .hint-disclosure summary,
  .plan-disclosure summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: clamp(12px, 1.6vw, 16px);
    cursor: pointer;
    list-style: none;
  }

  .hint-disclosure summary::-webkit-details-marker,
  .plan-disclosure summary::-webkit-details-marker {
    display: none;
  }

  .hint-disclosure summary::after,
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

  .hint-disclosure[open] summary::after,
  .plan-disclosure[open] summary::after {
    content: '-';
  }

  .hint-disclosure summary span,
  .plan-disclosure summary span {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .hint-disclosure summary strong,
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
      overflow: auto;
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
    border: 1px solid var(--glass-border-strong);
    border-radius: 12px;
    background: color-mix(in srgb, var(--app-bg) 64%, transparent);
    color: var(--text-primary);
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
    background: color-mix(in srgb, var(--app-bg) 78%, transparent);
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
    background: color-mix(in srgb, var(--app-bg) 72%, transparent);
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
    background: var(--surface);
  }

  .picker-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: clamp(12px, 1.6vw, 16px);
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

  .picker-card__content {
    display: grid;
    gap: 8px;
    justify-items: center;
    width: 100%;
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
    background: var(--surface-raised);
  }
  .picker-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .picker-initials {
    font-size: 22px;
    font-weight: 900;
    font-style: normal;
    color: var(--text-primary);
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

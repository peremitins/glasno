<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { nanoid } from 'nanoid';
  import type {
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
  } from '@radix-icons/vue';
  import InterviewerCard from '@/app/components/interview/InterviewerCard.vue';
  import LocalCameraPreview from '@/app/components/interview/LocalCameraPreview.vue';
  import { RealtimeInterviewChatAdapter } from '@/app/services/realtime/realtimeInterviewChatAdapter';

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

  const answer = ref('');
  const errorMessage = ref('');
  const isSending = ref(false);
  const isGeneratingReport = ref(false);
  const isSpeakingQuestion = ref(false);
  const runtimeMessages = ref<ConversationMessage[]>([]);
  const realtimeAdapter = ref<RealtimeInterviewChatAdapter | null>(null);

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
      if (turn.answerTranscript) {
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
        runtimeMessages.value.push({
          id,
          role,
          content,
          meta:
            role === 'user'
              ? t('interview.session.liveTranscript')
              : t('interview.session.liveInterviewer'),
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
    if (isNextQuestionCommand(normalized)) {
      if (answer.value.trim().length >= 2) {
        void sendAnswer();
      }
      return;
    }
    answer.value = answer.value.trim()
      ? `${answer.value.trim()}\n${normalized}`
      : normalized;
  }

  function isNextQuestionCommand(value: string): boolean {
    return /^(следующий вопрос|дальше|перейдём дальше|перейдем дальше)$/i.test(
      value.trim()
    );
  }

  async function sendAnswer() {
    const turn = currentTurn.value;
    if (!turn || answer.value.trim().length < 2 || isSending.value) return;

    isSending.value = true;
    errorMessage.value = '';
    try {
      state.value = await api<InterviewStateResponse>(
        `/api/interview/sessions/${sessionId.value}/answer`,
        {
          method: 'POST',
          body: {
            turnId: turn.id,
            answer: answer.value.trim(),
          },
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
    if (!question || !isTtsEnabled.value || isSpeakingQuestion.value) return;

    isSpeakingQuestion.value = true;
    try {
      await tts.speak(question);
    } finally {
      isSpeakingQuestion.value = false;
    }
  }

  async function generateReport() {
    if (!state.value?.session.id || isGeneratingReport.value) return;

    isGeneratingReport.value = true;
    errorMessage.value = '';
    try {
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

  // --- Режим видеозвонка: полный экран, камера, скрываемые панели ---
  const isFullscreen = ref(false);
  const cameraEnabled = ref(false); // по умолчанию камера выключена, как в Zoom
  const chatOpen = ref(true); // боковой чат
  const hintsOpen = ref(false); // боковые подсказки

  function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
  }

  function toggleCamera() {
    cameraEnabled.value = !cameraEnabled.value;
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

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
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
                :is-speaking="isSpeakingQuestion"
              />
            </div>
            <!-- Кандидат снизу -->
            <div class="vtile vtile--self">
              <LocalCameraPreview :active="cameraEnabled" />
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
              :disabled="isSpeakingQuestion"
              @click="speakQuestion"
            >
              {{ t('voice.tts.listen') }}
            </button>
          </div>

          <!-- Нижний док с иконками (управление звонком) -->
          <div class="dock">
            <button
              class="dock-btn"
              :class="{ 'dock-btn--off': !cameraEnabled }"
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

            <ol class="chat-feed" aria-live="polite">
              <li
                v-for="message in conversationMessages"
                :key="message.id"
                class="chat-message"
                :class="`chat-message--${message.role}`"
              >
                <small>{{ message.meta }}</small>
                <p>{{ message.content }}</p>
              </li>
            </ol>

            <form class="composer" @submit.prevent="sendAnswer">
              <textarea
                id="answer"
                v-model="answer"
                rows="3"
                :placeholder="t('interview.session.answerLabel')"
              />
              <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
              <div class="composer-actions">
                <div class="composer-tools">
                  <VoiceInput v-model="answer" :disabled="isSending" />
                  <RealtimeVoicePanel
                    variant="icon"
                    :session-id="sessionId"
                    :disabled="isSending"
                    :realtime-limits="state.session.realtimeLimits"
                    :on-event="handleRealtimeEvent"
                  />
                </div>
                <button
                  class="send-btn"
                  type="submit"
                  :disabled="answer.trim().length < 2 || isSending"
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
                    <em class="coach-label">{{ t('interview.session.plan') }}</em>
                    <strong>{{ t('interview.session.planProgress', planProgress) }}</strong>
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

  /* Текущий вопрос */
  .now-question {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 12px 16px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--surface-soft);
  }

  .now-question p {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: clamp(15px, 1.4vw, 18px);
    font-weight: 600;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .listen-mini {
    border: 1px solid var(--glass-border);
    border-radius: 10px;
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    padding: 7px 10px;
    white-space: nowrap;
  }

  /* Нижний док с иконками */
  .dock {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg, 18px);
    background: var(--surface-soft);
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
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
    transition: background var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out);
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

  .dock-btn:hover {
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  /* Активное состояние тоггла (чат/подсказки открыты) */
  .dock-btn--active {
    background: var(--button-bg);
    color: var(--button-text);
  }

  /* Камера выключена — приглушаем */
  .dock-btn--off {
    color: var(--text-muted);
  }

  /* Завершить — акцент-красный */
  .dock-btn--end {
    color: var(--danger);
  }
  .dock-btn--end:hover {
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
    max-height: min(780px, calc(100dvh - 160px));
    min-height: 0;
    padding: 14px;
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
    border-top: 1px solid var(--glass-border);
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
    .now-question {
      flex-wrap: wrap;
    }
  }
</style>

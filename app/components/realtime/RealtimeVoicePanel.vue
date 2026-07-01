<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRealtimeVoiceSession } from '@/app/composables/useRealtimeVoiceSession';
import { useRealtimeVoiceCallFeedback } from '@/app/composables/useRealtimeVoiceCallFeedback';
import type { RealtimeSessionLimits } from '@/shared/dto';

const props = defineProps<{
  sessionId: string;
  disabled?: boolean;
  realtimeLimits?: RealtimeSessionLimits;
  onEvent?: (event: unknown) => void;
  voiceProfileKey?: string | null;
  // 'panel' — полная карточка; 'icon' — компактная иконка-кнопка для композера.
  variant?: 'panel' | 'icon';
}>();

const { t } = useI18n();
const realtimeVoice = useRealtimeVoiceSession({
  sessionId: props.sessionId,
  onEvent: (event) => props.onEvent?.(event),
});

// Звуковая обратная связь звонка: гудок при соединении, сигнал «можно
// говорить» при коннекте, глушение при ошибке/разъединении.
const callFeedback = useRealtimeVoiceCallFeedback({
  status: realtimeVoice.status,
  errorMessage: realtimeVoice.errorMessage,
});

// Обёртка над toggle: запускаем фидбэк в рамках жеста пользователя
// (это же разблокирует аудио для гудка/сигнала готовности).
function onToggle() {
  if (realtimeVoice.isActive.value) {
    callFeedback.notifyHangupIntent();
  } else {
    void callFeedback.notifyCallIntent();
  }
  void realtimeVoice.toggle();
}
const elapsedSeconds = ref(0);
const limitMessage = ref('');
let timer: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
let warningShown = false;
let softShown = false;
let hardStopped = false;
let restartAfterBusyProfileChange = false;

const statusLabel = computed(() =>
  t(`voice.realtime.status.${realtimeVoice.status.value}`)
);

const elapsedLabel = computed(() => {
  const minutes = Math.floor(elapsedSeconds.value / 60);
  const seconds = elapsedSeconds.value % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
});

const remainingLabel = computed(() => {
  const hardLimit =
    realtimeVoice.activeSession.value?.maxDurationSeconds ??
    (props.realtimeLimits?.hardLimitMinutes ?? 10) * 60;
  const remaining = Math.max(0, hardLimit - elapsedSeconds.value);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
});

function clearTimer() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

function startTimer() {
  clearTimer();
  startedAt = Date.now();
  elapsedSeconds.value = 0;
  limitMessage.value = '';
  warningShown = false;
  softShown = false;
  hardStopped = false;
  timer = setInterval(() => {
    elapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
    enforceLimits();
  }, 1000);
}

function enforceLimits() {
  const limits = props.realtimeLimits;
  if (!limits) return;
  const elapsedMinutes = elapsedSeconds.value / 60;
  if (!warningShown && elapsedMinutes >= limits.warningAtMinutes) {
    warningShown = true;
    limitMessage.value = t('voice.realtime.limit.warning', {
      minutes: limits.softLimitMinutes,
    });
  }
  if (!softShown && elapsedMinutes >= limits.softLimitMinutes) {
    softShown = true;
    limitMessage.value = t('voice.realtime.limit.soft', {
      minutes: limits.hardLimitMinutes,
    });
  }
  if (!hardStopped && elapsedMinutes >= limits.hardLimitMinutes) {
    hardStopped = true;
    limitMessage.value = t('voice.realtime.limit.hard');
    void realtimeVoice.stop('hard_limit');
  }
}

watch(
  () => realtimeVoice.status.value,
  (status) => {
    if (status === 'connected') {
      startTimer();
      if (restartAfterBusyProfileChange) {
        restartAfterBusyProfileChange = false;
        void realtimeVoice.restart();
      }
      return;
    }
    if (status === 'idle' || status === 'error') {
      clearTimer();
      elapsedSeconds.value = 0;
    }
  }
);

watch(
  () => props.voiceProfileKey,
  (nextKey, previousKey) => {
    if (!previousKey || !nextKey || nextKey === previousKey) return;
    if (realtimeVoice.isBusy.value) {
      restartAfterBusyProfileChange = true;
      return;
    }
    if (!realtimeVoice.isActive.value) return;
    void realtimeVoice.restart();
  }
);

onBeforeUnmount(() => {
  clearTimer();
});
</script>

<template>
  <!-- Компактный вариант: одна иконка-кнопка с тултипом (для композера чата) -->
  <button
    v-if="variant === 'icon'"
    class="rt-icon"
    type="button"
    :class="{ 'rt-icon--active': realtimeVoice.isActive.value }"
    :disabled="disabled || realtimeVoice.isBusy.value"
    v-tooltip="
      realtimeVoice.isActive.value
        ? t('voice.realtime.stop')
        : t('voice.realtime.start')
    "
    @click="onToggle"
  >
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  </button>

  <section v-else class="realtime-panel">
    <div class="copy">
      <p class="eyebrow">{{ t('voice.realtime.eyebrow') }}</p>
      <h3>{{ t('voice.realtime.title') }}</h3>
      <p>{{ t('voice.realtime.subtitle') }}</p>
    </div>

    <div class="controls">
      <span class="status" :class="{ 'status--active': realtimeVoice.isActive.value }">
        <span aria-hidden="true"></span>
        {{ statusLabel }}
      </span>
      <span v-if="realtimeVoice.isActive.value" class="timer">
        {{ elapsedLabel }} / {{ remainingLabel }}
      </span>
      <button
        class="voice-action"
        type="button"
        :disabled="disabled || realtimeVoice.isBusy.value"
        @click="onToggle"
      >
        {{
          realtimeVoice.isActive.value
            ? t('voice.realtime.stop')
            : t('voice.realtime.start')
        }}
      </button>
    </div>

    <p v-if="realtimeVoice.errorMessage.value" class="voice-error">
      {{ realtimeVoice.errorMessage.value }}
    </p>
    <p v-if="limitMessage" class="limit-message">
      {{ limitMessage }}
    </p>
  </section>
</template>

<style scoped>
/* Иконка-кнопка realtime (вариант 'icon') — согласована с кнопкой диктовки. */
.rt-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--glass-border, var(--color-border));
  border-radius: 12px;
  color: var(--text-secondary, var(--color-text));
  background: var(--surface-soft, var(--color-surface));
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    background 0.18s ease;
}
.rt-icon svg {
  width: 20px;
  height: 20px;
}
.rt-icon:hover {
  border-color: var(--glass-border-strong, var(--color-border));
  color: var(--text-primary, var(--color-text));
}
.rt-icon:active {
  transform: translateY(1px);
}
.rt-icon:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
/* Идёт разговор — акцентная подсветка + пульс. */
.rt-icon--active {
  border-color: color-mix(in srgb, var(--accent, var(--color-accent)) 55%, transparent);
  color: var(--accent, var(--color-accent));
  background: color-mix(in srgb, var(--accent, var(--color-accent)) 12%, transparent);
  animation: rt-pulse 1.4s ease-in-out infinite;
}
@keyframes rt-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent, var(--color-accent)) 32%, transparent);
  }
  50% {
    box-shadow: 0 0 0 6px transparent;
  }
}

.realtime-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  padding: 18px;
}

.copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eyebrow,
.copy h3,
.copy p {
  margin: 0;
}

.eyebrow {
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.copy h3 {
  font-size: 18px;
}

.copy p {
  color: var(--color-muted);
}

.controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.status span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
}

.status--active {
  color: var(--color-accent);
}

.timer {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.voice-action {
  border: 0;
  border-radius: 10px;
  color: white;
  background: var(--color-text);
  font: inherit;
  font-weight: 800;
  padding: 10px 14px;
  cursor: pointer;
}

.voice-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.voice-error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-danger);
  font-size: 14px;
  font-weight: 700;
}

.limit-message {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 720px) {
  .realtime-panel {
    grid-template-columns: 1fr;
  }

  .controls {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>

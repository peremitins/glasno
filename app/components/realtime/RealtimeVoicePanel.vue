<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    useRealtimeVoiceSession,
    type RealtimeVoiceControl,
  } from '@/app/composables/useRealtimeVoiceSession';
  import { useRealtimeVoiceCallFeedback } from '@/app/composables/useRealtimeVoiceCallFeedback';
  import { useBillingStatus } from '@/app/composables/useBillingStatus';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import PaywallModal from '@/app/components/billing/PaywallModal.vue';
  import type { RealtimeSessionLimits } from '@/shared/dto';

  const props = defineProps<{
    sessionId: string;
    disabled?: boolean;
    realtimeLimits?: RealtimeSessionLimits;
    onEvent?: (event: unknown) => void;
    // Отдаёт родителю управление realtime-сессией (отправка событий, отмена
    // ответа) — для голосовой команды «следующий вопрос» и озвучки нового вопроса.
    onControl?: (control: RealtimeVoiceControl | null) => void;
    voiceProfileKey?: string | null;
    // 'panel' — полная карточка; 'icon' — компактная иконка-кнопка для композера.
    variant?: 'panel' | 'icon';
  }>();

  const { t } = useI18n();
  const realtimeVoice = useRealtimeVoiceSession({
    sessionId: props.sessionId,
    onEvent: (event) => props.onEvent?.(event),
  });

  props.onControl?.({
    sendEvent: realtimeVoice.sendEvent,
    cancelActiveResponses: realtimeVoice.cancelActiveResponses,
  });

  // Звуковая обратная связь звонка: гудок при соединении, сигнал «можно
  // говорить» при коннекте, глушение при ошибке/разъединении.
  const callFeedback = useRealtimeVoiceCallFeedback({
    status: realtimeVoice.status,
    errorMessage: realtimeVoice.errorMessage,
  });

  // Пейволл (паттерн Mentala): если минуты голоса кончились — на кнопке
  // бейдж 💎, клик открывает пейволл вместо запуска сессии.
  const billing = useBillingStatus();
  const paywallOpen = ref(false);
  // Докупка минут доступна при любом активном платном тарифе (Pro или
  // разовый доступ) — иначе показываем выбор тарифов.
  const paywallMode = computed(() =>
    billing.canBuyMinutes.value ? 'minutes' : 'plans'
  );
  const isLocked = computed(
    () => billing.realtimeLocked.value && !realtimeVoice.isActive.value
  );

  onMounted(() => {
    void billing.ensureLoaded();
  });

  // Обёртка над toggle: запускаем фидбэк в рамках жеста пользователя
  // (это же разблокирует аудио для гудка/сигнала готовности).
  function onToggle() {
    if (isLocked.value) {
      paywallOpen.value = true;
      return;
    }
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

  const iconButtonLabel = computed(() => {
    if (realtimeVoice.isActive.value) return t('voice.realtime.stopShort');
    if (isLocked.value) return t('voice.realtime.unlockShort');
    return t('voice.realtime.startShort');
  });

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

  let wasConnected = false;

  // После завершения голосовой сессии сверяемся с биллингом: если минуты голоса
  // исчерпаны (в т.ч. realtime оборвался по hard-лимиту остатка минут) — явно
  // сообщаем и открываем paywall. Текстовый режим при этом остаётся доступен.
  async function handleSessionEnded() {
    await billing.refresh();
    if (billing.realtimeLocked.value) {
      limitMessage.value = t('voice.realtime.limit.exhausted');
      paywallOpen.value = true;
    }
  }

  watch(
    () => realtimeVoice.status.value,
    (status) => {
      if (status === 'connected') {
        wasConnected = true;
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
        if (wasConnected) {
          wasConnected = false;
          void handleSessionEnded();
        }
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
    props.onControl?.(null);
  });
</script>

<template>
  <!-- Компактный CTA с тултипом для композера чата. -->
  <button
    v-if="variant === 'icon'"
    v-tooltip="
      isLocked
        ? t('voice.realtime.locked')
        : realtimeVoice.isActive.value
        ? t('voice.realtime.stop')
        : t('voice.realtime.start')
    "
    class="rt-icon button-loader-host"
    type="button"
    :class="{ 'rt-icon--active': realtimeVoice.isActive.value }"
    :disabled="disabled || realtimeVoice.isBusy.value"
    :aria-label="isLocked ? t('voice.realtime.locked') : undefined"
    @click="onToggle"
  >
    <ButtonLoader v-if="realtimeVoice.isBusy.value" />
    <span
      class="button-loader-content"
      :class="{
        'button-loader-content--loading': realtimeVoice.isBusy.value,
      }"
    >
      <span class="rt-icon-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
      </span>
      <span class="rt-icon-label">{{ iconButtonLabel }}</span>
      <span
        v-if="!realtimeVoice.isActive.value"
        class="rt-icon-live"
        aria-hidden="true"
      >
        LIVE
      </span>
    </span>
    <span v-if="isLocked" class="rt-lock-badge" aria-hidden="true">💎</span>
  </button>

  <section v-else class="realtime-panel glass-frame glass-frame--soft">
    <div class="copy">
      <p class="panel-label">{{ t('voice.realtime.eyebrow') }}</p>
      <h3>{{ t('voice.realtime.title') }}</h3>
      <p>{{ t('voice.realtime.subtitle') }}</p>
    </div>

    <div class="controls">
      <span
        class="status"
        :class="{ 'status--active': realtimeVoice.isActive.value }"
      >
        <span aria-hidden="true" />
        {{ statusLabel }}
      </span>
      <span v-if="realtimeVoice.isActive.value" class="timer">
        {{ elapsedLabel }} / {{ remainingLabel }}
      </span>
      <button
        class="voice-action button-loader-host"
        type="button"
        :disabled="disabled || realtimeVoice.isBusy.value"
        @click="onToggle"
      >
        <ButtonLoader v-if="realtimeVoice.isBusy.value" />
        <span
          class="button-loader-content"
          :class="{
            'button-loader-content--loading': realtimeVoice.isBusy.value,
          }"
        >
          <span v-if="isLocked" aria-hidden="true">💎</span>
          {{
            realtimeVoice.isActive.value
              ? t('voice.realtime.stop')
              : t('voice.realtime.start')
          }}
        </span>
      </button>
    </div>

    <p v-if="realtimeVoice.errorMessage.value" class="voice-error">
      {{ realtimeVoice.errorMessage.value }}
    </p>
    <p v-if="limitMessage" class="limit-message">
      {{ limitMessage }}
    </p>
  </section>

  <PaywallModal v-model:open="paywallOpen" :mode="paywallMode" />
</template>

<style scoped>
  /* CTA realtime (вариант 'icon') — заметнее обычной иконки и сохраняет текст на узких экранах. */
  .rt-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 44px;
    max-width: 100%;
    height: 44px;
    border: 1px solid color-mix(in srgb, var(--accent) 48%, var(--glass-border));
    border-radius: 999px;
    color: var(--button-text);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent) 92%, var(--button-bg)),
      color-mix(in srgb, var(--accent-2) 78%, var(--button-bg))
    );
    box-shadow: inset 0 1px 0
        color-mix(in srgb, var(--glass-sheen) 22%, transparent),
      0 12px 24px -16px color-mix(in srgb, var(--accent) 70%, transparent);
    cursor: pointer;
    isolation: isolate;
    /* Без overflow: hidden — иначе угловой бейдж «Pro» (top/right: -4px)
     обрезается краем кнопки. Внутренние слои (::before, .rt-icon-mark)
     самодостаточны по border-radius и в клипе не нуждаются. */
    padding: 0 12px 0 10px;
    transition: transform 0.18s ease, border-color 0.18s ease, color 0.18s ease,
      background 0.18s ease, box-shadow 0.18s ease;
  }

  .rt-icon::before {
    position: absolute;
    inset: 1px;
    z-index: -1;
    border-radius: inherit;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--glass-sheen) 16%, transparent),
      transparent 44%
    );
    content: '';
    pointer-events: none;
  }

  .rt-icon-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--glass-sheen) 16%, transparent);
    color: currentColor;
    flex: 0 0 auto;
  }

  .rt-icon-mark svg {
    width: 20px;
    height: 20px;
  }

  .rt-icon-label {
    min-width: 0;
    font-size: 13px;
    font-weight: 900;
    line-height: 1;
    white-space: nowrap;
  }

  .rt-icon-live {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 18px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--glass-sheen) 18%, transparent);
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.08em;
    line-height: 1;
  }

  .rt-icon:hover {
    border-color: color-mix(
      in srgb,
      var(--accent) 65%,
      var(--glass-border-strong)
    );
    box-shadow: inset 0 1px 0
        color-mix(in srgb, var(--glass-sheen) 28%, transparent),
      0 14px 28px -15px color-mix(in srgb, var(--accent) 78%, transparent);
    transform: translateY(-1px);
  }
  .rt-icon:active {
    transform: translateY(1px);
  }
  .rt-icon:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  /* Бейдж премиум-фичи (звёздочка) в углу кнопки. */
  .rt-lock-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    border: 1px solid var(--glass-border-strong);
    background: color-mix(in srgb, var(--surface-solid) 82%, transparent);
    font-size: 10px;
    line-height: 1;
    pointer-events: none;
  }

  .rt-icon {
    position: relative;
  }

  /* Идёт разговор — акцентная подсветка + пульс. */
  .rt-icon--active {
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    color: var(--button-text);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--danger) 72%, var(--button-bg)),
      color-mix(in srgb, var(--accent) 76%, var(--button-bg))
    );
    animation: rt-pulse 1.4s ease-in-out infinite;
  }
  @keyframes rt-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 32%, transparent);
    }
    50% {
      box-shadow: 0 0 0 6px transparent;
    }
  }

  @media (max-width: 380px) {
    .rt-icon-live {
      display: none;
    }
  }

  .realtime-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
    align-items: center;
    padding: 18px;
  }

  .copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .panel-label,
  .copy h3,
  .copy p {
    margin: 0;
  }

  .copy h3 {
    color: var(--text-primary);
    font-size: 18px;
  }

  .copy p {
    color: var(--text-muted);
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
    color: var(--text-muted);
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
    color: var(--accent-2);
  }

  .timer {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 900;
    white-space: nowrap;
  }

  .voice-action {
    border: 0;
    border-radius: var(--radius-control);
    color: var(--button-text);
    background: var(--button-bg);
    box-shadow: var(--button-shadow);
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
    color: var(--danger);
    font-size: 14px;
    font-weight: 700;
  }

  .limit-message {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--text-muted);
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

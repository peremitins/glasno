<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { Cross2Icon, EnvelopeClosedIcon, PersonIcon } from '@radix-icons/vue';
  import { useI18n } from 'vue-i18n';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import { useYookassaWidget } from '@/app/composables/useYookassaWidget';
  import type { BillingPlan } from '@/shared/dto';

  const props = defineProps<{
    open: boolean;
    plan: BillingPlan | null;
    gift: boolean;
    autoRenew: boolean;
    recipientEmail: string;
    senderName: string;
    recipientEmailError?: string;
    senderNameError?: string;
    checkoutError?: string;
    pending?: boolean;
    // Токен и return_url для встроенного виджета YooKassa. Пока пусты —
    // показываем форму; как только приходят — переключаемся на виджет.
    confirmationToken?: string;
    returnUrl?: string;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'update:gift': [value: boolean];
    'update:autoRenew': [value: boolean];
    'update:recipientEmail': [value: string];
    'update:senderName': [value: string];
    clearError: [];
    submit: [];
    // Вернуться от виджета к форме (например, после ошибки виджета).
    back: [];
  }>();

  const { t } = useI18n();
  const emailInput = ref<HTMLInputElement | null>(null);
  const {
    state: widgetState,
    mount: mountWidget,
    destroy: destroyWidget,
  } = useYookassaWidget();

  const showWidget = computed(() => Boolean(props.confirmationToken));

  // Оболочка чекаута видна всегда, кроме момента, когда окно YooKassa
  // реально открыто: на время загрузки показываем статус, при сбое — ошибку
  // с «Повторить». Scroll-lock привязан к той же видимости, чтобы не
  // «залипнуть» на невидимой модалке.
  const shellVisible = computed(
    () => props.open && Boolean(props.plan) && widgetState.value !== 'open'
  );

  useBodyScrollLock(shellVisible);
  const giftAllowed = computed(() => props.plan?.type === 'pass');
  const displayGift = computed(() => props.gift && giftAllowed.value);
  // Автопродление показываем только для пропуска себе: пакеты минут —
  // разовые, подарок — всегда без автопродления.
  const renewalAvailable = computed(
    () => props.plan?.type === 'pass' && !displayGift.value
  );
  const renewalEnabled = computed(
    () => renewalAvailable.value && props.autoRenew
  );
  const periodLabel = computed(() => {
    if (!props.plan) return '';
    if (props.plan.type === 'minute_pack') {
      return t('pricing.minutesAmount', {
        minutes: props.plan.realtimeVoiceMinutes,
      });
    }
    return t('pricing.periodDays', { days: props.plan.durationDays });
  });
  // Дата следующего списания = конец покупаемого срока.
  const nextChargeDate = computed(() => {
    if (!props.plan || props.plan.type !== 'pass') return '';
    const date = new Date();
    date.setDate(date.getDate() + props.plan.durationDays);
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
    }).format(date);
  });

  function formatPrice(value: number) {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  function close() {
    if (!props.pending) emit('update:open', false);
  }

  function updateGift(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    emit('update:gift', checked);
    emit('clearError');
  }

  function updateAutoRenew(event: Event) {
    emit('update:autoRenew', (event.target as HTMLInputElement).checked);
    emit('clearError');
  }

  function updateEmail(event: Event) {
    emit('update:recipientEmail', (event.target as HTMLInputElement).value);
    emit('clearError');
  }

  function updateSenderName(event: Event) {
    emit('update:senderName', (event.target as HTMLInputElement).value);
    emit('clearError');
  }

  watch(
    () => [props.open, props.gift] as const,
    async ([open, gift]) => {
      if (!open || !gift) return;
      await nextTick();
      emailInput.value?.focus();
    }
  );

  // Как только пришёл токен, открываем нативное всплывающее окно YooKassa
  // (оболочка на это время показывает лоадер/ошибку). Закрытие окна
  // возвращает пользователя к форме. Ошибка загрузки НЕ уводит к форме —
  // токен остаётся для кнопки «Повторить».
  watch(
    () => [props.open, props.confirmationToken] as const,
    async ([open, token]) => {
      if (!open || !token || !props.returnUrl) {
        destroyWidget();
        return;
      }
      await openWidget();
    }
  );

  async function openWidget() {
    if (!props.confirmationToken || !props.returnUrl) return;
    await mountWidget({
      confirmationToken: props.confirmationToken,
      returnUrl: props.returnUrl,
      modal: true,
      onModalClose: () => emit('back'),
    });
  }

  // Повторная попытка с тем же токеном: при сбое загрузки скрипт-промис
  // сброшен, mount перезагрузит checkout-widget.js заново.
  async function retryWidget() {
    await openWidget();
  }

  onBeforeUnmount(destroyWidget);
</script>

<template>
  <Teleport to="body">
    <Transition name="checkout-modal-fade">
      <div
        v-if="shellVisible && plan"
        class="checkout-modal-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="t('pricing.summaryLabel')"
        tabindex="-1"
        @click.self="close"
        @keydown.esc="close"
      >
        <section class="checkout-modal glass-frame">
          <header class="checkout-modal-header">
            <div>
              <p>{{ t('pricing.checkoutLabel') }}</p>
              <h2>{{ plan.name }}</h2>
            </div>
            <button
              type="button"
              class="checkout-modal-close"
              :aria-label="t('common.close')"
              :disabled="pending"
              @click="close"
            >
              <Cross2Icon aria-hidden="true" />
            </button>
          </header>

          <div class="checkout-total">
            <strong>{{ formatPrice(plan.priceRub) }} ₽</strong>
            <span>{{ periodLabel }}</span>
          </div>

          <!-- Токен получен, окно YooKassa грузится/не загрузилось: вместо
               формы показываем статус, а не пустой экран. -->
          <template v-if="showWidget && widgetState === 'loading'">
            <p class="checkout-provider checkout-widget-message">
              {{ t('paywall.widgetOpening') }}
            </p>
          </template>

          <template v-else-if="showWidget && widgetState === 'failed'">
            <p class="checkout-error" role="alert">
              {{ t('paywall.widgetError') }}
            </p>
            <div class="checkout-widget-actions">
              <button
                type="button"
                class="secondary-action"
                @click="emit('back')"
              >
                {{ t('paywall.widgetBack') }}
              </button>
              <button
                type="button"
                class="primary-action"
                @click="retryWidget"
              >
                {{ t('paywall.widgetRetry') }}
              </button>
            </div>
          </template>

          <template v-else>
          <label v-if="giftAllowed" class="gift-switch">
              <span>
                <strong>{{ t('pricing.giftToFriend') }}</strong>
                <small>{{ t('pricing.giftSwitchHint') }}</small>
              </span>
              <input :checked="gift" type="checkbox" @change="updateGift">
              <span class="gift-switch-control" aria-hidden="true" />
            </label>

            <!-- Автопродление включено по умолчанию (ТЗ тарифы v2): явный
               контрол с датой и суммой следующего списания, а не мелкая
               подпись. Снятие галочки делает покупку разовой. -->
            <label v-if="renewalAvailable" class="gift-switch">
              <span>
                <strong>{{ t('pricing.autoRenewSwitchLabel') }}</strong>
                <small v-if="renewalEnabled">
                  {{
                    t('pricing.autoRenewSwitchHint', {
                      date: nextChargeDate,
                      amount: formatPrice(plan.priceRub),
                    })
                  }}
                </small>
                <small v-else>{{ t('pricing.autoRenewSwitchOffHint') }}</small>
              </span>
              <input
                :checked="autoRenew"
                type="checkbox"
                @change="updateAutoRenew"
              >
              <span class="gift-switch-control" aria-hidden="true" />
            </label>

            <div v-if="displayGift" class="gift-field">
              <label for="gift-recipient-email">{{
                t('pricing.giftEmailLabel')
              }}</label>
              <div class="input-shell">
                <EnvelopeClosedIcon aria-hidden="true" />
                <input
                  id="gift-recipient-email"
                  ref="emailInput"
                  :value="recipientEmail"
                  type="email"
                  inputmode="email"
                  autocomplete="email"
                  autocapitalize="none"
                  spellcheck="false"
                  :placeholder="t('pricing.giftEmailPlaceholder')"
                  :aria-invalid="Boolean(recipientEmailError)"
                  required
                  @input="updateEmail"
                >
              </div>
              <small v-if="recipientEmailError" class="field-error">
                {{ recipientEmailError }}
              </small>
            </div>

            <div v-if="displayGift" class="gift-field">
              <label for="gift-sender-name">{{
                t('pricing.giftSenderNameLabel')
              }}</label>
              <div class="input-shell">
                <PersonIcon aria-hidden="true" />
                <input
                  id="gift-sender-name"
                  :value="senderName"
                  type="text"
                  autocomplete="name"
                  maxlength="80"
                  :placeholder="t('pricing.giftSenderNamePlaceholder')"
                  :aria-invalid="Boolean(senderNameError)"
                  required
                  @input="updateSenderName"
                >
              </div>
              <small v-if="senderNameError" class="field-error">
                {{ senderNameError }}
              </small>
            </div>

            <p class="checkout-provider">{{ t('pricing.checkoutProvider') }}</p>
            <p v-if="checkoutError" class="checkout-error" role="alert">
              {{ checkoutError }}
            </p>
            <button
              type="button"
              class="primary-action button-loader-host checkout-submit"
              :disabled="pending"
              @click="emit('submit')"
            >
              <ButtonLoader v-if="pending" />
              <span
                class="button-loader-content"
                :class="{ 'button-loader-content--loading': pending }"
              >
                {{
                  displayGift
                    ? t('pricing.giftCheckoutCta', {
                        amount: formatPrice(plan.priceRub),
                      })
                    : t('pricing.checkoutCta', {
                        amount: formatPrice(plan.priceRub),
                      })
                }}
              </span>
            </button>
            <p class="checkout-disclosure">
              {{
                displayGift
                  ? t('pricing.giftDisclosure')
                  : renewalEnabled
                  ? t('pricing.autoRenewDisclosure', {
                      amount: formatPrice(plan.priceRub),
                      date: nextChargeDate,
                    })
                  : t('pricing.oneTimeDisclosure')
              }}
            </p>
          </template>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .checkout-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 230;
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: clamp(16px, 5vh, 40px) 16px;
    background: color-mix(in srgb, var(--surface-solid) 72%, transparent);
    backdrop-filter: blur(8px);
  }

  .checkout-modal {
    display: grid;
    gap: 18px;
    width: min(430px, 100%);
    max-height: 100%;
    padding: clamp(20px, 4vw, 30px);
    overflow-y: auto;
    overscroll-behavior: contain;
    overflow-x: hidden;
    background: var(--surface-solid);
  }

  .checkout-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .checkout-modal-header div {
    display: grid;
    gap: 4px;
  }

  .checkout-modal-header p,
  .checkout-modal-header h2,
  .checkout-provider,
  .checkout-disclosure,
  .checkout-error {
    margin: 0;
  }

  .checkout-modal-header p {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .checkout-modal-header h2 {
    color: var(--text-primary);
    font-size: clamp(18px, 3vw, 22px);
  }

  .checkout-modal-close {
    display: grid;
    flex: 0 0 40px;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--glass-border);
    border-radius: 14px;
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .checkout-modal-close:hover {
    border-color: var(--glass-border-strong);
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .checkout-total {
    display: grid;
    gap: 3px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--glass-border);
  }

  .checkout-total strong {
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: clamp(34px, 8vw, 46px);
    line-height: 1;
  }

  .checkout-total span,
  .checkout-provider,
  .checkout-disclosure {
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .gift-switch {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    cursor: pointer;
  }

  .gift-switch > span:first-child,
  .gift-field {
    display: grid;
    gap: 8px;
  }

  .gift-switch strong,
  .gift-field > label {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 800;
  }

  .gift-switch small {
    color: var(--text-muted);
    font-size: 12px;
  }

  .gift-switch input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .gift-switch-control {
    position: relative;
    flex: 0 0 44px;
    width: 44px;
    height: 24px;
    border: 1px solid var(--glass-border-strong);
    border-radius: 999px;
    background: var(--surface-soft);
    transition: background var(--motion-fast) var(--ease-out);
  }

  .gift-switch-control::after {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-primary);
    content: '';
    transition: transform var(--motion-fast) var(--ease-out);
  }

  .gift-switch input:checked + .gift-switch-control {
    background: color-mix(in srgb, var(--accent) 72%, var(--surface-soft));
  }

  .gift-switch input:checked + .gift-switch-control::after {
    transform: translateX(20px);
  }

  .gift-switch input:focus-visible + .gift-switch-control {
    outline: 2px solid var(--accent-2);
    outline-offset: 3px;
  }

  .field-error,
  .checkout-error {
    color: var(--danger);
    font-size: 12px;
    line-height: 1.45;
  }

  .checkout-provider {
    padding-top: 16px;
    border-top: 1px solid var(--glass-border);
  }

  .checkout-submit {
    width: 100%;
  }

  /* Состояния «Открываем оплату…» / ошибки окна YooKassa вместо формы. */
  .checkout-widget-message {
    font-size: 14px;
  }

  .checkout-widget-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .checkout-modal-fade-enter-active,
  .checkout-modal-fade-leave-active {
    transition: opacity var(--motion-fast) var(--ease-out);
  }

  .checkout-modal-fade-enter-from,
  .checkout-modal-fade-leave-to {
    opacity: 0;
  }

  @media (max-width: 640px) {
    .checkout-modal-overlay {
      align-items: end;
      padding: 10px;
    }

    .checkout-modal {
      width: 100%;
      max-height: calc(100dvh - 20px);
      border-radius: var(--radius-lg);
    }

  }
</style>

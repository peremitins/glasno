<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue';
  import {
    Cross2Icon,
    EnvelopeClosedIcon,
    PersonIcon,
  } from '@radix-icons/vue';
  import { useI18n } from 'vue-i18n';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import type { BillingPlan } from '@/shared/dto';

  const props = defineProps<{
    open: boolean;
    plan: BillingPlan | null;
    gift: boolean;
    recipientEmail: string;
    senderName: string;
    recipientEmailError?: string;
    senderNameError?: string;
    checkoutError?: string;
    pending?: boolean;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    'update:gift': [value: boolean];
    'update:recipientEmail': [value: string];
    'update:senderName': [value: string];
    clearError: [];
    submit: [];
  }>();

  const { t } = useI18n();
  const emailInput = ref<HTMLInputElement | null>(null);
  const giftAllowed = computed(() => props.plan?.kind !== 'addon');
  const displayGift = computed(() => props.gift && giftAllowed.value);
  const periodLabel = computed(() => {
    if (!props.plan) return '';
    if (props.plan.kind === 'addon') {
      return t('pricing.minutesAmount', {
        minutes: props.plan.realtimeVoiceMinutes,
      });
    }
    return props.plan.interval === 'month'
      ? t('pricing.period30Days')
      : t('pricing.period7Days');
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
</script>

<template>
  <Teleport to="body">
    <Transition name="checkout-modal-fade">
      <div
        v-if="open && plan"
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

          <label v-if="giftAllowed" class="gift-switch">
            <span>
              <strong>{{ t('pricing.giftToFriend') }}</strong>
              <small>{{ t('pricing.giftSwitchHint') }}</small>
            </span>
            <input :checked="gift" type="checkbox" @change="updateGift">
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
                : plan.interval === 'month'
                ? t('pricing.autoRenewDisclosure', {
                    amount: formatPrice(plan.priceRub),
                  })
                : t('pricing.oneTimeDisclosure')
            }}
          </p>
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
    padding: 16px;
    background: color-mix(in srgb, var(--surface-solid) 72%, transparent);
    backdrop-filter: blur(8px);
  }

  .checkout-modal {
    display: grid;
    gap: 18px;
    width: min(430px, 100%);
    max-height: min(720px, calc(100dvh - 32px));
    padding: clamp(20px, 4vw, 30px);
    overflow-y: auto;
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

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import ConfirmModal from '@/app/components/design/ConfirmModal.vue';
  import type {
    BillingBindCardResponseDto,
    BillingCheckoutResponse,
    BillingPaymentStatusResponse,
    BillingPlansResponse,
    BillingStatusResponse,
  } from '@/shared/dto';
  import type { z } from 'zod';

  const { t } = useI18n();
  const api = useAPI();
  const route = useRoute();

  const checkoutPlanId = ref('');
  const errorMessage = ref('');
  const paymentStatusMessage = ref('');
  const paymentStatusPending = ref(false);
  const cardActionPending = ref(false);

  const { data: plansData, pending: plansPending } = await useLazyAsyncData(
    'billing-plans',
    () => api<BillingPlansResponse>('/api/billing/plans')
  );
  const {
    data: status,
    pending: statusPending,
    refresh: refreshStatus,
  } = await useLazyAsyncData('billing-status', () =>
    api<BillingStatusResponse>('/api/billing/status')
  );

  const returnNoticeVisible = computed(() => route.query.payment === 'return');
  const bindingReturnVisible = computed(() => route.query.binding === 'return');
  const returnOrderId = computed(() =>
    typeof route.query.orderId === 'string' ? route.query.orderId : ''
  );
  const plansInitialPending = computed(
    () => plansPending.value && !plansData.value
  );
  const statusInitialPending = computed(
    () => statusPending.value && !status.value
  );

  // Тарифы и пакеты минут — разные сущности: тарифы дают доступ,
  // пакеты — расходник к активному тарифу. Показываем отдельными блоками.
  const mainPlans = computed(() =>
    (plansData.value?.plans || []).filter((plan) => plan.kind !== 'addon')
  );
  const minutePacks = computed(() =>
    (plansData.value?.plans || []).filter((plan) => plan.kind === 'addon')
  );
  const packsLocked = computed(
    () => !status.value?.hasActiveSubscription && !status.value?.unlimited
  );

  // --- Блок «Текущий доступ» (по образцу Mentala) ---------------------
  const currentPlanLabel = computed(() => {
    if (status.value?.unlimited) return t('pricing.adminAccess');
    return status.value?.activePlanName || t('billing.free');
  });
  const billingInfo = computed(() => status.value?.billing ?? null);
  const paymentMethodLabel = computed(() => {
    const method = billingInfo.value?.paymentMethod;
    if (!method) return '';
    if (method.cardLast4) {
      const brand = method.cardBrand || t('pricing.card');
      return `${brand} •••• ${method.cardLast4}`;
    }
    return method.title || t('pricing.card');
  });
  const showMinutes = computed(
    () =>
      Boolean(status.value) &&
      !status.value!.unlimited &&
      status.value!.realtimeVoice.includedMinutes > 0
  );

  function formatPrice(value: number) {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return '';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(value));
  }

  async function checkout(planId: string) {
    if (checkoutPlanId.value) return;
    checkoutPlanId.value = planId;
    errorMessage.value = '';
    try {
      const response = await api<BillingCheckoutResponse>(
        '/api/billing/checkout',
        {
          method: 'POST',
          body: { planId },
        }
      );
      window.location.href = response.confirmationUrl;
    } catch (err) {
      if (err && typeof err === 'object' && 'data' in err) {
        const data = (err as { data?: { error?: { message?: string } } }).data;
        errorMessage.value = data?.error?.message || t('pricing.error');
      } else {
        errorMessage.value = t('pricing.error');
      }
    } finally {
      checkoutPlanId.value = '';
    }
  }

  // Привязка карты без платежа: бэкенд создаёт payment_method в YooKassa
  // и отдаёт confirmationUrl — редиректим пользователя на подтверждение.
  async function bindCard() {
    if (cardActionPending.value) return;
    cardActionPending.value = true;
    errorMessage.value = '';
    try {
      const response = await api<z.infer<typeof BillingBindCardResponseDto>>(
        '/api/billing/payment-method/bind',
        { method: 'POST' }
      );
      window.location.href = response.confirmationUrl;
    } catch (err) {
      const data = (err as { data?: { error?: { message?: string } } })?.data;
      errorMessage.value = data?.error?.message || t('pricing.bindError');
      cardActionPending.value = false;
    }
  }

  // Подтверждения действий с картой/автопродлением — кастомная модалка
  // вместо системного window.confirm (паттерн AlertDialog из Mentala).
  type ConfirmAction = 'unbind' | 'enableRenew' | 'disableRenew';
  const confirmAction = ref<ConfirmAction | null>(null);
  const confirmOpen = computed({
    get: () => confirmAction.value !== null,
    set: (value: boolean) => {
      if (!value) confirmAction.value = null;
    },
  });
  const confirmContent = computed(() => {
    switch (confirmAction.value) {
      case 'unbind':
        return {
          title: t('pricing.unbindConfirmTitle'),
          description: t('pricing.unbindConfirmText'),
          confirmLabel: t('pricing.unbindCard'),
          tone: 'danger' as const,
        };
      case 'enableRenew':
        return {
          title: t('pricing.enableRenewConfirmTitle'),
          description: t('pricing.enableRenewConfirmText'),
          confirmLabel: t('pricing.enableAutoRenew'),
          tone: 'default' as const,
        };
      case 'disableRenew':
        return {
          title: t('pricing.disableRenewConfirmTitle'),
          description: t('pricing.disableRenewConfirmText', {
            date: formatDate(status.value?.subscriptionExpiresAt),
          }),
          confirmLabel: t('pricing.disableAutoRenew'),
          tone: 'default' as const,
        };
      default:
        return null;
    }
  });

  async function onConfirmAction() {
    const action = confirmAction.value;
    if (!action) return;
    if (action === 'unbind') {
      await unbindCard();
    } else {
      await setAutoRenew(action === 'enableRenew');
    }
    confirmAction.value = null;
  }

  // Отвязка карты (по образцу Mentala): карта удаляется, автопродление
  // выключается, оплаченный период остаётся до конца.
  async function unbindCard() {
    if (cardActionPending.value) return;
    cardActionPending.value = true;
    errorMessage.value = '';
    try {
      await api('/api/billing/payment-method/unbind', { method: 'POST' });
      await refreshStatus();
    } catch {
      errorMessage.value = t('pricing.unbindError');
    } finally {
      cardActionPending.value = false;
    }
  }

  async function setAutoRenew(enabled: boolean) {
    if (cardActionPending.value) return;
    cardActionPending.value = true;
    errorMessage.value = '';
    try {
      await api('/api/billing/auto-renew', {
        method: 'POST',
        body: { enabled },
      });
      await refreshStatus();
    } catch (err) {
      const data = (err as { data?: { error?: { message?: string } } })?.data;
      errorMessage.value = data?.error?.message || t('pricing.error');
    } finally {
      cardActionPending.value = false;
    }
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchCheckoutStatus(): Promise<BillingPaymentStatusResponse> {
    const params = new URLSearchParams();
    if (returnOrderId.value) {
      params.set('orderId', returnOrderId.value);
    }
    const query = params.toString();
    return await api<BillingPaymentStatusResponse>(
      `/api/billing/checkout-status${query ? `?${query}` : ''}`
    );
  }

  async function reconcileReturnedPayment() {
    if (paymentStatusPending.value) return;
    paymentStatusPending.value = true;
    paymentStatusMessage.value = t('pricing.paymentChecking');

    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const paymentStatus = await fetchCheckoutStatus();
        await refreshStatus();

        if (paymentStatus.hasActiveSubscription) {
          paymentStatusMessage.value = t('pricing.paymentActivated');
          return;
        }

        if (!paymentStatus.shouldContinuePolling) {
          paymentStatusMessage.value =
            paymentStatus.providerStatus === 'canceled'
              ? t('pricing.paymentCanceled')
              : t('pricing.paymentReview');
          return;
        }

        await wait(attempt < 3 ? 1000 : 2500);
      }

      paymentStatusMessage.value = t('pricing.paymentPending');
    } catch {
      paymentStatusMessage.value = t('pricing.paymentPending');
    } finally {
      paymentStatusPending.value = false;
    }
  }

  onMounted(() => {
    if (returnNoticeVisible.value) {
      void reconcileReturnedPayment();
    }
    // Возврат после привязки карты: status.get сам синхронизирует
    // pending-привязку с YooKassa — достаточно перезапросить статус.
    if (bindingReturnVisible.value) {
      void refreshStatus();
    }
  });
</script>

<template>
  <div class="pricing-page app-page">
    <GlassSkeletonStack
      v-if="statusInitialPending"
      class="status-skeleton"
      :heights="[132]"
    />
    <!-- Текущий доступ: тариф, срок, минуты, автосписание, карта -->
    <section v-else class="status glass-frame glass-frame--soft">
      <div class="status-main">
        <p class="panel-label">{{ t('pricing.current') }}</p>
        <h2>{{ currentPlanLabel }}</h2>
        <p v-if="status?.hasActiveSubscription" class="status-line">
          {{
            t('pricing.activeUntil', {
              date: formatDate(status.subscriptionExpiresAt),
            })
          }}
        </p>
        <p v-else-if="!status?.unlimited" class="status-line">
          {{
            t('pricing.freeUsed', {
              used: status?.freeSessionsUsed ?? 0,
              limit: status?.freeSessionsLimit ?? 1,
            })
          }}
        </p>
        <p v-if="showMinutes" class="status-line status-line--minutes">
          {{
            t('pricing.minutesCounter', {
              remaining: status!.realtimeVoice.remainingMinutes,
              included: status!.realtimeVoice.includedMinutes,
            })
          }}
        </p>
      </div>

      <div v-if="billingInfo" class="status-billing">
        <p class="panel-label">{{ t('pricing.billingLabel') }}</p>
        <p v-if="billingInfo.autoRenew && billingInfo.nextChargeAt" class="status-line">
          {{
            t('pricing.nextCharge', {
              amount: formatPrice(billingInfo.nextChargeAmountRub ?? 0),
              date: formatDate(billingInfo.nextChargeAt),
            })
          }}
        </p>
        <p v-else class="status-line">
          {{
            status?.hasActiveSubscription
              ? t('pricing.autoRenewOff', {
                  date: formatDate(status?.subscriptionExpiresAt),
                })
              : t('pricing.autoRenewNone')
          }}
        </p>
        <p v-if="billingInfo.lastChargeError" class="status-line status-line--error">
          {{ t('pricing.chargeError') }}
        </p>
        <p v-if="paymentMethodLabel" class="status-line status-line--card">
          {{ paymentMethodLabel }}
        </p>
        <p v-else class="status-line">
          {{ t('pricing.noCard') }}
        </p>
        <div class="status-actions">
          <button
            v-if="!billingInfo.paymentMethod"
            type="button"
            class="secondary-action secondary-action--compact"
            :disabled="cardActionPending"
            @click="bindCard"
          >
            {{ t('pricing.bindCard') }}
          </button>
          <button
            v-if="billingInfo.autoRenew"
            type="button"
            class="secondary-action secondary-action--compact"
            :disabled="cardActionPending"
            @click="confirmAction = 'disableRenew'"
          >
            {{ t('pricing.disableAutoRenew') }}
          </button>
          <button
            v-else-if="billingInfo.paymentMethod && status?.hasActiveSubscription"
            type="button"
            class="secondary-action secondary-action--compact"
            :disabled="cardActionPending"
            @click="confirmAction = 'enableRenew'"
          >
            {{ t('pricing.enableAutoRenew') }}
          </button>
          <button
            v-if="billingInfo.paymentMethod"
            type="button"
            class="secondary-action secondary-action--compact"
            :disabled="cardActionPending"
            @click="confirmAction = 'unbind'"
          >
            {{ t('pricing.unbindCard') }}
          </button>
        </div>
      </div>

      <NuxtLink
        v-if="status?.needsAuthForCheckout"
        to="/profile"
        class="secondary-action secondary-action--compact status-auth"
      >
        {{ t('pricing.goProfile') }}
      </NuxtLink>
    </section>

    <p
      v-if="returnNoticeVisible"
      class="notice glass-frame glass-alert glass-alert--accent"
    >
      {{ paymentStatusMessage || t('pricing.returnNotice') }}
    </p>
    <p
      v-if="errorMessage"
      class="error glass-frame glass-alert glass-alert--danger"
    >
      {{ errorMessage }}
    </p>

    <section class="plans">
      <GlassSkeletonStack
        v-if="plansInitialPending || statusInitialPending"
        class="plans-skeleton"
        :heights="[320, 320, 320]"
      />
      <template v-else>
        <article
          v-for="plan in mainPlans"
          :key="plan.id"
          class="plan glass-frame glass-frame--soft"
          :class="{ 'plan--highlighted': plan.isHighlighted }"
        >
          <span v-if="plan.badge" class="badge">{{ plan.badge }}</span>
          <header class="plan-header">
            <h2>{{ plan.name }}</h2>
            <p class="plan-description">{{ plan.description }}</p>
          </header>
          <div class="price">
            <strong>{{ formatPrice(plan.priceRub) }} ₽</strong>
            <span v-if="plan.interval === 'month'">
              / {{ t('pricing.month') }}</span
            >
            <span v-else-if="plan.priceRub > 0">{{
              t('pricing.oneTimePayment')
            }}</span>
          </div>
          <ul class="features">
            <li v-for="feature in plan.features" :key="feature">
              {{ feature }}
            </li>
          </ul>
          <div class="plan-cta">
            <button
              v-if="plan.isCheckoutEnabled"
              class="primary-action primary-action--compact button-loader-host"
              type="button"
              :disabled="
                Boolean(checkoutPlanId) ||
                statusPending ||
                status?.needsAuthForCheckout
              "
              @click="checkout(plan.id)"
            >
              <ButtonLoader v-if="checkoutPlanId === plan.id" />
              <span
                class="button-loader-content"
                :class="{
                  'button-loader-content--loading': checkoutPlanId === plan.id,
                }"
              >
                {{ t('pricing.checkout') }}
              </span>
            </button>
            <span
              v-else
              class="current secondary-action secondary-action--compact"
            >
              {{
                status?.hasActiveSubscription || status?.activePlanId
                  ? t('pricing.freePlanIncluded')
                  : t('pricing.currentPlan')
              }}
            </span>
          </div>
        </article>
      </template>
    </section>

    <section
      v-if="!plansInitialPending && !statusInitialPending && minutePacks.length"
      class="packs-section"
    >
      <div class="packs-header">
        <h2>{{ t('pricing.minutePacksTitle') }}</h2>
        <p class="muted">{{ t('pricing.minutePacksSubtitle') }}</p>
      </div>
      <p
        v-if="packsLocked"
        class="notice glass-frame glass-alert glass-alert--accent"
      >
        {{ t('pricing.packsNeedPlan') }}
      </p>
      <div class="packs">
        <article
          v-for="pack in minutePacks"
          :key="pack.id"
          class="plan pack glass-frame glass-frame--soft"
        >
          <span v-if="pack.badge" class="badge">{{ pack.badge }}</span>
          <header class="plan-header">
            <h3>{{ pack.name }}</h3>
            <p class="plan-description">{{ pack.description }}</p>
          </header>
          <div class="price">
            <strong>{{ formatPrice(pack.priceRub) }} ₽</strong>
            <span>{{ t('pricing.oneTimePayment') }}</span>
          </div>
          <ul class="features">
            <li v-for="feature in pack.features" :key="feature">
              {{ feature }}
            </li>
          </ul>
          <div class="plan-cta">
            <button
              class="primary-action primary-action--compact button-loader-host"
              type="button"
              :disabled="
                Boolean(checkoutPlanId) ||
                statusPending ||
                status?.needsAuthForCheckout ||
                packsLocked
              "
              @click="checkout(pack.id)"
            >
              <ButtonLoader v-if="checkoutPlanId === pack.id" />
              <span
                class="button-loader-content"
                :class="{
                  'button-loader-content--loading': checkoutPlanId === pack.id,
                }"
              >
                {{ t('pricing.buyPack') }}
              </span>
            </button>
          </div>
        </article>
      </div>
    </section>

    <ConfirmModal
      v-if="confirmContent"
      v-model:open="confirmOpen"
      :title="confirmContent.title"
      :description="confirmContent.description"
      :confirm-label="confirmContent.confirmLabel"
      :cancel-label="t('pricing.confirmCancel')"
      :tone="confirmContent.tone"
      :pending="cardActionPending"
      @confirm="onConfirmAction"
    />
  </div>
</template>

<style scoped>
  .pricing-page {
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 1.6vw, 16px);
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  .muted {
    color: var(--text-muted);
  }

  /* --- Текущий доступ ------------------------------------------------ */
  /* Равные колонки 50/50: правый блок «Оплата» не прыгает от длины
     текста при смене состояния автопродления. */
  .status {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(16px, 2.4vw, 32px);
    align-items: start;
    padding: clamp(18px, 2.2vw, 26px);
  }

  .status-main,
  .status-billing {
    display: grid;
    gap: 6px;
    align-content: start;
    min-width: 0;
  }

  /* Если блока «Оплата» нет (аноним) — основной блок на всю ширину. */
  .status-main:only-child,
  .status-main:last-of-type:first-of-type {
    grid-column: 1 / -1;
  }

  .status-main h2 {
    font-size: 22px;
    color: var(--text-primary);
  }

  .status-line {
    color: var(--text-muted);
    font-size: 14px;
  }

  .status-line--minutes {
    color: var(--text-primary);
    font-weight: 600;
  }

  .status-line--card {
    font-family: var(--font-mono);
    color: var(--text-primary);
    font-size: 13px;
  }

  .status-line--error {
    color: var(--danger, #f87171);
  }

  .status-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .status-auth {
    grid-column: 1 / -1;
    justify-self: start;
  }

  /* --- Сетка тарифов -------------------------------------------------- */
  .plans {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(12px, 1.6vw, 16px);
    align-items: stretch;
  }

  .status-skeleton,
  .plans-skeleton {
    width: 100%;
  }

  .plans-skeleton {
    grid-column: 1 / -1;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(12px, 1.6vw, 16px);
  }

  /* Карточка: flex-колонка, фичи растягиваются, CTA прижата к низу.
     Все карточки в ряду одной высоты (align-items: stretch на сетке). */
  .plan {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: 100%;
    padding: clamp(20px, 2.2vw, 24px);
  }

  .plan--highlighted {
    border-color: var(--glass-border-strong);
    box-shadow: var(--shadow-panel),
      0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
  }

  .badge {
    position: absolute;
    top: 14px;
    right: 14px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent-2);
    font-family: var(--font-mono);
    padding: 5px 9px;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .plan-header {
    display: grid;
    gap: 6px;
    /* Не даём заголовку заезжать под бейдж. */
    padding-right: 84px;
  }

  .plan-header h2 {
    font-size: 20px;
    color: var(--text-primary);
  }

  .plan-header h3 {
    font-size: 17px;
    color: var(--text-primary);
  }

  .plan-description {
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.45;
  }

  .price {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .price strong {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 28px;
    line-height: 1;
  }

  .price span {
    color: var(--text-muted);
    font-size: 13px;
  }

  .features {
    display: grid;
    gap: 8px;
    margin: 0;
    padding-left: 18px;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.45;
    /* Растягиваем список, чтобы CTA у всех карточек была на одном уровне. */
    flex: 1 1 auto;
    align-content: start;
  }

  .features li::marker {
    color: var(--accent);
  }

  .plan-cta {
    margin-top: auto;
    display: grid;
  }

  .plan-cta .primary-action,
  .plan-cta .secondary-action {
    width: 100%;
    justify-content: center;
    text-align: center;
  }

  .primary-action:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .current {
    color: var(--text-muted);
    cursor: default;
  }

  /* --- Пакеты минут ---------------------------------------------------- */
  .packs-section {
    display: grid;
    gap: clamp(10px, 1.4vw, 14px);
  }

  .packs-header p {
    margin-top: 4px;
  }

  .packs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(12px, 1.6vw, 16px);
    align-items: stretch;
  }

  /* --- Адаптив ---------------------------------------------------------- */
  @media (max-width: 1100px) {
    .plans {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .plans,
    .plans-skeleton,
    .packs {
      grid-template-columns: 1fr;
    }

    .status {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .secondary-action,
    .primary-action {
      width: 100%;
    }
  }
</style>

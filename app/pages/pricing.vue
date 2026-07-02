<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import type {
    BillingCheckoutResponse,
    BillingPaymentStatusResponse,
    BillingPlansResponse,
    BillingStatusResponse,
  } from '@/shared/dto';

  const { t } = useI18n();
  const api = useAPI();
  const route = useRoute();

  const checkoutPlanId = ref('');
  const errorMessage = ref('');
  const paymentStatusMessage = ref('');
  const paymentStatusPending = ref(false);

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
  const returnOrderId = computed(() =>
    typeof route.query.orderId === 'string' ? route.query.orderId : ''
  );
  const plansInitialPending = computed(
    () => plansPending.value && !plansData.value
  );
  const statusInitialPending = computed(
    () => statusPending.value && !status.value
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
  });
</script>

<template>
  <div class="pricing-page app-page">
    <GlassSkeletonStack
      v-if="statusInitialPending"
      class="status-skeleton"
      :heights="[112]"
    />
    <section v-else class="status glass-frame glass-frame--soft">
      <div>
        <p class="panel-label">{{ t('pricing.current') }}</p>
        <h2>
          {{
            status?.hasActiveSubscription
              ? t('billing.active')
              : t('billing.inactive')
          }}
        </h2>
        <p>
          {{
            status?.hasActiveSubscription
              ? t('pricing.activeUntil', {
                  date: formatDate(status.subscriptionExpiresAt),
                })
              : t('pricing.freeUsed', {
                  used: status?.freeSessionsUsed ?? 0,
                  limit: status?.freeSessionsLimit ?? 1,
                })
          }}
        </p>
      </div>
      <NuxtLink
        v-if="status?.needsAuthForCheckout"
        to="/profile"
        class="secondary-action secondary-action--compact"
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
        :heights="[292, 292, 292]"
      />
      <template v-else>
        <article
          v-for="plan in plansData?.plans || []"
          :key="plan.id"
          class="plan glass-frame glass-frame--soft"
          :class="{ 'plan--highlighted': plan.isHighlighted }"
        >
          <span v-if="plan.badge" class="badge">{{ plan.badge }}</span>
          <h2>{{ plan.name }}</h2>
          <p>{{ plan.description }}</p>
          <div class="price">
            <strong>{{ formatPrice(plan.priceRub) }} ₽</strong>
            <span v-if="plan.interval === 'month'"
              >/ {{ t('pricing.month') }}</span
            >
          </div>
          <div class="features">
            <h3>{{ t('pricing.included') }}</h3>
            <ul>
              <li v-for="feature in plan.features" :key="feature">
                {{ feature }}
              </li>
            </ul>
          </div>
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
            {{ t('pricing.currentPlan') }}
          </span>
        </article>
      </template>
    </section>
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

  .status p:last-child,
  .plan p,
  .muted {
    color: var(--text-muted);
  }

  .status {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: center;
    padding: clamp(18px, 2.2vw, 26px);
  }

  .plans {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(12px, 1.6vw, 16px);
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

  .plan {
    position: relative;
    display: grid;
    gap: 14px;
    align-content: start;
    padding: clamp(18px, 2.2vw, 24px);
  }

  .plan--highlighted {
    border-color: var(--glass-border-strong);
    box-shadow: var(--shadow-panel),
      0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
  }

  .badge {
    justify-self: start;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent-2);
    font-family: var(--font-mono);
    padding: 5px 9px;
    font-size: 12px;
    font-weight: 900;
  }

  .price {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .price strong {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 30px;
  }

  .price span {
    color: var(--text-muted);
  }

  .features {
    display: grid;
    gap: 8px;
  }

  .features h3 {
    font-size: 14px;
  }

  ul {
    display: grid;
    gap: 8px;
    margin: 0;
    padding-left: 18px;
  }

  .primary-action:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .current {
    color: var(--text-muted);
    cursor: default;
  }

  @media (max-width: 900px) {
    .plans,
    .plans-skeleton {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .status {
      align-items: stretch;
      flex-direction: column;
    }

    .secondary-action,
    .primary-action {
      width: 100%;
    }
  }
</style>

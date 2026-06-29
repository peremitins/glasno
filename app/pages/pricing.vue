<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  BillingCheckoutResponse,
  BillingPlansResponse,
  BillingStatusResponse,
} from '@/shared/dto';

const { t } = useI18n();
const api = useAPI();
const route = useRoute();

const checkoutPlanId = ref('');
const errorMessage = ref('');

const { data: plansData, pending: plansPending } = await useAsyncData(
  'billing-plans',
  () => api<BillingPlansResponse>('/api/billing/plans')
);
const { data: status } = await useAsyncData('billing-status', () =>
  api<BillingStatusResponse>('/api/billing/status')
);

const returnNoticeVisible = computed(() => route.query.payment === 'return');

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
    const response = await api<BillingCheckoutResponse>('/api/billing/checkout', {
      method: 'POST',
      body: { planId },
    });
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
</script>

<template>
  <div class="page">
    <header class="header">
      <p class="eyebrow">{{ t('nav.pricing') }}</p>
      <h1>{{ t('pricing.title') }}</h1>
      <p>{{ t('pricing.subtitle') }}</p>
    </header>

    <section class="status">
      <div>
        <p class="label">{{ t('pricing.current') }}</p>
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
              ? t('pricing.activeUntil', { date: formatDate(status.subscriptionExpiresAt) })
              : t('pricing.freeUsed', {
                  used: status?.freeSessionsUsed ?? 0,
                  limit: status?.freeSessionsLimit ?? 1,
                })
          }}
        </p>
      </div>
      <NuxtLink v-if="status?.needsAuthForCheckout" to="/profile" class="ghost">
        {{ t('pricing.goProfile') }}
      </NuxtLink>
    </section>

    <p v-if="returnNoticeVisible" class="notice">{{ t('pricing.returnNotice') }}</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <section class="plans">
      <p v-if="plansPending" class="muted">{{ t('common.loading') }}</p>
      <template v-else>
        <article
          v-for="plan in plansData?.plans || []"
          :key="plan.id"
          class="plan"
          :class="{ 'plan--highlighted': plan.isHighlighted }"
        >
          <span v-if="plan.badge" class="badge">{{ plan.badge }}</span>
          <h2>{{ plan.name }}</h2>
          <p>{{ plan.description }}</p>
          <div class="price">
            <strong>{{ formatPrice(plan.priceRub) }} ₽</strong>
            <span v-if="plan.interval === 'month'">/ {{ t('pricing.month') }}</span>
          </div>
          <div class="features">
            <h3>{{ t('pricing.included') }}</h3>
            <ul>
              <li v-for="feature in plan.features" :key="feature">{{ feature }}</li>
            </ul>
          </div>
          <button
            v-if="plan.isCheckoutEnabled"
            class="primary"
            type="button"
            :disabled="Boolean(checkoutPlanId) || status?.needsAuthForCheckout"
            @click="checkout(plan.id)"
          >
            {{
              checkoutPlanId === plan.id
                ? t('pricing.processing')
                : t('pricing.checkout')
            }}
          </button>
          <span v-else class="current">{{ t('pricing.currentPlan') }}</span>
        </article>
      </template>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.header {
  max-width: 780px;
}

.eyebrow,
.label {
  margin: 0 0 8px;
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin: 0;
}

.header h1 {
  font-size: clamp(30px, 4vw, 44px);
  line-height: 1.06;
  margin-bottom: 10px;
}

.header p:last-child,
.status p:last-child,
.plan p,
.muted {
  color: var(--color-muted);
}

.status,
.plan,
.notice,
.error {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.status {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 18px;
}

.notice,
.error {
  padding: 12px;
  font-weight: 800;
}

.notice {
  color: var(--color-accent);
}

.error {
  color: var(--color-danger);
}

.plans {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.plan {
  position: relative;
  display: grid;
  gap: 14px;
  align-content: start;
  padding: 18px;
}

.plan--highlighted {
  border-color: color-mix(in srgb, var(--color-accent) 45%, white);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 10%, white);
}

.badge {
  justify-self: start;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-accent) 12%, white);
  color: var(--color-accent);
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
  font-size: 30px;
}

.price span {
  color: var(--color-muted);
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

.primary,
.ghost,
.current {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  border-radius: 8px;
  padding: 0 14px;
  font: inherit;
  font-weight: 800;
}

.primary {
  border: 0;
  color: #fff;
  background: var(--color-accent);
  cursor: pointer;
}

.primary:disabled {
  cursor: default;
  opacity: 0.55;
}

.ghost {
  color: var(--color-text);
  background: var(--color-bg);
  text-decoration: none;
}

.current {
  color: var(--color-muted);
  background: var(--color-bg);
}

@media (max-width: 900px) {
  .plans {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .status {
    align-items: stretch;
    flex-direction: column;
  }

  .ghost,
  .primary {
    width: 100%;
  }
}
</style>

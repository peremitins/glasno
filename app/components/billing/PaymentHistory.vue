<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import type {
    BillingPaymentHistoryItem,
    BillingPaymentHistoryResponse,
  } from '@/shared/dto';

  const { t } = useI18n();
  const api = useAPI();
  const items = ref<BillingPaymentHistoryItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const loadMorePending = ref(false);
  defineExpose({ refresh: refreshHistory });

  const { data, pending, refresh } = await useLazyAsyncData(
    'billing-payments',
    () => api<BillingPaymentHistoryResponse>('/api/billing/payments?limit=20')
  );

  watch(
    data,
    (value) => {
      if (!value) return;
      items.value = value.items;
      nextCursor.value = value.nextCursor;
    },
    { immediate: true }
  );

  const initialPending = computed(() => pending.value && !data.value);

  function formatPrice(value: number) {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  function paymentStatusLabel(status: string) {
    if (status === 'succeeded') return t('pricing.historyStatus.succeeded');
    if (status === 'canceled') return t('pricing.historyStatus.canceled');
    if (status === 'failed') return t('pricing.historyStatus.failed');
    return t('pricing.historyStatus.pending');
  }

  function giftStatusLabel(status: string) {
    return t(`pricing.historyGiftStatus.${status}`);
  }

  function notificationLabel(status: string) {
    if (status === 'sent') return t('pricing.historyEmailStatus.sent');
    if (status === 'failed') return t('pricing.historyEmailStatus.failed');
    return t('pricing.historyEmailStatus.pending');
  }

  function statusTone(status: string) {
    if (status === 'succeeded') return 'success';
    if (status === 'canceled' || status === 'failed') return 'danger';
    return 'muted';
  }

  async function loadMore() {
    if (!nextCursor.value || loadMorePending.value) return;
    loadMorePending.value = true;
    try {
      const params = new URLSearchParams({
        limit: '20',
        cursor: nextCursor.value,
      });
      const page = await api<BillingPaymentHistoryResponse>(
        `/api/billing/payments?${params.toString()}`
      );
      const knownIds = new Set(items.value.map((item) => item.id));
      items.value.push(...page.items.filter((item) => !knownIds.has(item.id)));
      nextCursor.value = page.nextCursor;
    } finally {
      loadMorePending.value = false;
    }
  }

  async function refreshHistory() {
    await refresh();
  }

</script>

<template>
  <section class="payment-history glass-frame glass-frame--soft">
    <header class="history-header">
      <div>
        <p class="panel-label">{{ t('pricing.historyLabel') }}</p>
        <h2>{{ t('pricing.historyTitle') }}</h2>
      </div>
      <p>{{ t('pricing.historySubtitle') }}</p>
    </header>

    <GlassSkeletonStack
      v-if="initialPending"
      class="history-skeleton"
      :heights="[72, 72, 72]"
    />
    <div v-else-if="items.length" class="history-list">
      <article v-for="item in items" :key="item.id" class="history-row">
        <div class="history-copy">
          <div class="history-title-row">
            <h3>{{ item.planName }}</h3>
            <span
              class="status-pill"
              :class="`status-pill--${statusTone(item.status)}`"
            >
              {{ paymentStatusLabel(item.status) }}
            </span>
          </div>
          <p class="history-meta">
            {{ formatDate(item.createdAt) }} · {{ item.provider }}
            <span v-if="item.operationId">· {{ item.operationId }}</span>
          </p>
          <div v-if="item.gift" class="gift-meta">
            <span>{{ t('pricing.historyGiftFor', { email: item.gift.recipientEmailMasked }) }}</span>
            <span>{{ giftStatusLabel(item.gift.status) }}</span>
            <span
              v-if="
                item.gift.status !== 'pending_payment' &&
                item.gift.status !== 'canceled'
              "
            >
              {{ notificationLabel(item.gift.notificationStatus) }}
            </span>
          </div>
        </div>
        <strong class="history-amount">
          {{ formatPrice(item.amountRub) }} ₽
        </strong>
      </article>
    </div>
    <div v-else class="history-empty">
      <h3>{{ t('pricing.historyEmptyTitle') }}</h3>
      <p>{{ t('pricing.historyEmpty') }}</p>
    </div>

    <button
      v-if="nextCursor"
      type="button"
      class="secondary-action secondary-action--compact history-more"
      :disabled="loadMorePending"
      @click="loadMore"
    >
      {{
        loadMorePending
          ? t('common.loading')
          : t('pricing.historyLoadMore')
      }}
    </button>
  </section>
</template>

<style scoped>
  .payment-history {
    display: grid;
    gap: 0;
    padding: clamp(18px, 2.2vw, 26px);
  }

  .history-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 18px;
  }

  .history-header div {
    display: grid;
    gap: 5px;
  }

  .history-header h2,
  .history-row h3,
  .history-empty h3,
  .history-header p,
  .history-row p,
  .history-empty p {
    margin: 0;
  }

  .history-header h2 {
    color: var(--text-primary);
    font-size: 18px;
  }

  .history-header > p,
  .history-empty p {
    color: var(--text-muted);
    font-size: 13px;
  }

  .history-list {
    display: grid;
  }

  .history-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
    align-items: center;
    padding: 16px 0;
    border-top: 1px solid var(--glass-border);
  }

  .history-copy {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .history-title-row,
  .gift-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .history-title-row h3 {
    color: var(--text-primary);
    font-size: 14px;
  }

  .history-meta,
  .gift-meta {
    color: var(--text-muted);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .gift-meta span + span::before {
    content: '·';
    margin-right: 8px;
  }

  .history-amount {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 15px;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
  }

  .status-pill--success {
    color: var(--accent-2);
    background: color-mix(in srgb, var(--accent-2) 14%, transparent);
  }

  .status-pill--danger {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }

  .status-pill--muted {
    color: var(--text-muted);
    background: var(--surface-soft);
  }

  .history-empty {
    display: grid;
    gap: 5px;
    padding: 26px 0 8px;
    border-top: 1px solid var(--glass-border);
  }

  .history-empty h3 {
    color: var(--text-primary);
    font-size: 14px;
  }

  .history-more {
    justify-self: start;
    margin-top: 12px;
  }

  @media (max-width: 640px) {
    .history-header {
      display: grid;
      gap: 8px;
    }

    .history-row {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .history-amount {
      grid-row: 2;
    }

    .history-more {
      width: 100%;
    }
  }
</style>

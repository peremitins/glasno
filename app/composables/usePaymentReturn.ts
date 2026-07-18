import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BillingPaymentStatusResponse } from '@/shared/dto';
import { trackPaidMetrikaGoal } from '@/app/utils/yandexMetrika';

// Сверка оплаты после возврата с YooKassa (?payment=return&orderId=...).
// Раньше жила только на /pricing; с появлением returnPath в checkout виджет
// может вернуть пользователя и на страницу интервью — логика общая.
// Поведение (тайминги, тексты, метрика) перенесено из pricing.vue 1:1.
export function usePaymentReturn(options?: {
  // Обновление billing-статуса страницы; вызывается на каждой итерации.
  refresh?: () => Promise<unknown>;
  // Оплата подтверждена (доступ активирован или подарок готов).
  onPaid?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const api = useAPI();
  const route = useRoute();

  const returnVisible = computed(() => route.query.payment === 'return');
  const orderId = computed(() =>
    typeof route.query.orderId === 'string' ? route.query.orderId : ''
  );
  const pending = ref(false);
  const message = ref('');

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchCheckoutStatus(): Promise<BillingPaymentStatusResponse> {
    const params = new URLSearchParams();
    if (orderId.value) {
      params.set('orderId', orderId.value);
    }
    const query = params.toString();
    return await api<BillingPaymentStatusResponse>(
      `/api/billing/checkout-status${query ? `?${query}` : ''}`
    );
  }

  async function reconcile() {
    if (pending.value) return;
    pending.value = true;
    message.value = t('pricing.paymentChecking');

    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const paymentStatus = await fetchCheckoutStatus();
        trackPaidMetrikaGoal(paymentStatus);
        await options?.refresh?.();

        if (
          paymentStatus.purchaseType === 'gift' &&
          paymentStatus.paid &&
          paymentStatus.gift
        ) {
          message.value = t('pricing.giftPaymentReady', {
            email: paymentStatus.gift.recipientEmailMasked,
          });
          await options?.onPaid?.();
          return;
        }

        if (paymentStatus.hasActivePaidAccess) {
          message.value = t('pricing.paymentActivated');
          await options?.onPaid?.();
          return;
        }

        if (!paymentStatus.shouldContinuePolling) {
          message.value =
            paymentStatus.providerStatus === 'canceled'
              ? t('pricing.paymentCanceled')
              : t('pricing.paymentReview');
          return;
        }

        await wait(attempt < 3 ? 1000 : 2500);
      }

      message.value = t('pricing.paymentPending');
    } catch {
      message.value = t('pricing.paymentPending');
    } finally {
      pending.value = false;
    }
  }

  return { returnVisible, orderId, pending, message, reconcile };
}

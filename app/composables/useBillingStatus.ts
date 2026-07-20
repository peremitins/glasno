import { computed, useState } from '#imports';
import type { BillingStatusResponse } from '@/shared/dto';

// Общий кэш биллинг-статуса (тариф, минуты, автопродление) для страниц
// и компонентов: пейволл, кнопки realtime voice, страница тарифов.
export function useBillingStatus() {
  const api = useAPI();
  const status = useState<BillingStatusResponse | null>(
    'billing-status',
    () => null
  );
  const pending = useState<boolean>('billing-status-pending', () => false);

  async function refresh(): Promise<BillingStatusResponse | null> {
    if (pending.value) return status.value;
    pending.value = true;
    try {
      status.value = await api<BillingStatusResponse>('/api/billing/status');
    } catch {
      // Статус не критичен для рендера: кнопки останутся в базовом состоянии.
    } finally {
      pending.value = false;
    }
    return status.value;
  }

  async function ensureLoaded(): Promise<BillingStatusResponse | null> {
    if (status.value) return status.value;
    return await refresh();
  }

  const remainingRealtimeMinutes = computed(
    () => status.value?.realtimeVoice.remainingMinutes ?? 0
  );
  const hasActivePaidAccess = computed(
    () => Boolean(status.value?.hasActivePaidAccess)
  );
  // Авторизованный пользователь может докупать пакеты минут и в трайле.
  const canBuyMinutes = computed(
    () => Boolean(status.value?.realtimeVoice.canBuyMore)
  );
  const unlimited = computed(() => Boolean(status.value?.unlimited));
  // Незавершённая триал-сессия: попытка израсходована созданием, но интервью
  // можно продолжить — вместо пейволла ведём в него.
  const trialResume = computed(() => status.value?.trialResume ?? null);
  // Realtime voice заблокирован: минуты кончились (или их не было).
  const realtimeLocked = computed(
    () =>
      Boolean(status.value) &&
      !unlimited.value &&
      remainingRealtimeMinutes.value <= 0
  );

  return {
    status,
    pending,
    refresh,
    ensureLoaded,
    remainingRealtimeMinutes,
    hasActivePaidAccess,
    canBuyMinutes,
    unlimited,
    trialResume,
    realtimeLocked,
  };
}

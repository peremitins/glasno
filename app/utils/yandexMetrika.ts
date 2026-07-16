import type { BillingPaymentStatusResponse } from '@/shared/dto';
import { YANDEX_METRIKA_COUNTER_ID } from '@/shared/config/yandexMetrika';
import {
  YandexMetrikaGoal,
  YandexMetrikaMethod,
  type YandexMetrikaGoalId,
} from '@/shared/analytics/yandexMetrika';

type YandexMetrikaFunction = (...args: unknown[]) => void;
type PaidConversion = NonNullable<BillingPaymentStatusResponse['conversion']>;

const PAID_ORDER_GOAL_STORAGE_PREFIX = 'glasno:metrika:paid-order:';

function getYandexMetrika(): YandexMetrikaFunction | null {
  if (typeof window === 'undefined') return null;
  const ym = (window as Window & { ym?: unknown }).ym;
  return typeof ym === 'function' ? (ym as YandexMetrikaFunction) : null;
}

/** Отправляет цель только после инициализации клиентского счётчика. */
export function reachYandexMetrikaGoal(goal: YandexMetrikaGoalId): boolean {
  const ym = getYandexMetrika();
  if (!ym) return false;

  ym(
    Number(YANDEX_METRIKA_COUNTER_ID),
    YandexMetrikaMethod.reachGoal,
    goal
  );
  return true;
}

/**
 * Оплата подтверждается сервером YooKassa, а не состоянием виджета. Один
 * orderId учитывается в Метрике ровно один раз даже при повторном возврате на
 * /pricing или перезагрузке страницы.
 */
export function trackPaidMetrikaGoal(
  payment: Pick<BillingPaymentStatusResponse, 'conversion' | 'orderId'>
): void {
  if (typeof window === 'undefined') return;

  const conversion = payment.conversion;
  if (!payment.orderId || !conversion) return;

  const goal = paidGoalFor(conversion);
  const storageKey = `${PAID_ORDER_GOAL_STORAGE_PREFIX}${goal}:${payment.orderId}`;

  try {
    if (window.localStorage.getItem(storageKey)) return;
  } catch {
    // В приватном режиме или при запрете storage цель всё равно отправляем.
  }

  if (!reachYandexMetrikaGoal(goal)) return;

  try {
    window.localStorage.setItem(storageKey, '1');
  } catch {
    // Недоступное хранилище не должно ломать успешный сценарий оплаты.
  }
}

function paidGoalFor(conversion: PaidConversion): YandexMetrikaGoalId {
  return conversion.planType === 'pass'
    ? YandexMetrikaGoal.passPaid
    : YandexMetrikaGoal.minutePackPaid;
}

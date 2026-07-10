import type {
  BillingCheckoutResponse,
  BillingPaymentStatusResponse,
  BillingPlansResponse,
  BillingStatusResponse,
} from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type {
  BillingOwner,
  BillingRepository,
  PaymentOrderRecord,
  SubscriptionRecord,
} from '@/server/interface/billingRepository';
import { BillingAccessService } from './accessService';
import {
  BILLING_PLANS,
  getBillingPlan,
  getPaidBillingPlan,
  getPublicBillingPlans,
} from './plans';
import {
  buildYooKassaReceipt,
  createYooKassaPayment,
  createYooKassaPaymentMethodBinding,
  createYooKassaRecurringPayment,
  extractYooKassaPaymentEvent,
  getYooKassaConfirmationUrl,
  getYooKassaPayment,
  getYooKassaPaymentMethod,
  type YooKassaConfig,
} from './yookassaClient';

// Не чаще одной попытки автосписания раз в 6 часов (анти-даблчардж +
// щадящие ретраи при ошибке карты).
const AUTO_RENEW_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
const AUTO_RENEW_PLAN_IDS = BILLING_PLANS.filter(
  (plan) => plan.kind === 'subscription' && plan.priceRub > 0
).map((plan) => plan.id);

export interface BillingServiceConfig {
  yookassa: YooKassaConfig;
  appUrl: string;
}

export class BillingService {
  private readonly access: BillingAccessService;

  constructor(
    private readonly deps: {
      repository: BillingRepository;
      config: BillingServiceConfig;
    }
  ) {
    this.access = new BillingAccessService({
      repository: deps.repository,
    });
  }

  getPlans(): BillingPlansResponse {
    return { plans: getPublicBillingPlans() };
  }

  async getStatus(owner: BillingOwner): Promise<BillingStatusResponse> {
    return this.access.getStatus(owner);
  }

  async createCheckout(params: {
    userId: string | null | undefined;
    planId: string;
  }): Promise<BillingCheckoutResponse> {
    if (!params.userId) {
      throw apiError('E_AUTH', 'Для оплаты войдите в профиль');
    }
    this.requireYooKassaConfig();

    const plan = getPaidBillingPlan(params.planId);

    // Пакеты минут — расходник к активному платному тарифу (подписка или
    // разовый доступ): без него они бесполезны (нельзя создавать интервью),
    // поэтому покупку блокируем.
    if (plan.requiresActiveSubscription) {
      const activeSubscriptions =
        await this.deps.repository.findActiveSubscriptionsByUserId(
          params.userId
        );
      const hasPaidAccess = activeSubscriptions.some((subscription) => {
        const kind = getBillingPlan(subscription.planId).kind;
        return kind === 'subscription' || kind === 'one_time';
      });
      if (!hasPaidAccess) {
        throw apiError(
          'E_FORBIDDEN',
          'Пакеты минут доступны только при активном платном тарифе'
        );
      }
    }

    const order = await this.deps.repository.createPaymentOrder({
      userId: params.userId,
      planId: plan.id,
      amountRub: plan.priceRub,
      currency: 'RUB',
      metadata: {
        userId: params.userId,
        planId: plan.id,
      },
    });

    // Чек 54-ФЗ: передаём receipt, если у пользователя указан email
    // (паттерн Mentala: без email платёж уходит без чека из кода).
    const email = await this.deps.repository.findUserEmail(params.userId);
    const description = `Гласно ${plan.name}`;

    try {
      const payment = await createYooKassaPayment({
        ...this.deps.config.yookassa,
        idempotenceKey: order.id,
        amountRub: plan.priceRub,
        returnUrl: buildYooKassaReturnUrl(this.deps.config.appUrl, order.id),
        description,
        metadata: {
          orderId: order.id,
          userId: params.userId,
          planId: plan.id,
        },
        receipt: email
          ? buildYooKassaReceipt({
              email,
              amountRub: plan.priceRub,
              description,
            })
          : undefined,
        // Подписки: просим YooKassa сохранить карту для автопродления.
        savePaymentMethod: plan.kind === 'subscription',
      });
      const confirmationUrl = getYooKassaConfirmationUrl(payment);
      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        providerPaymentId: payment.id,
        status: payment.status || 'pending',
        confirmationUrl,
      });

      return {
        provider: 'yookassa',
        orderId: order.id,
        confirmationUrl,
      };
    } catch (err) {
      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        status: 'failed',
      });
      if (err && typeof err === 'object' && 'data' in err) {
        throw apiError('E_UPSTREAM', 'YooKassa отклонила создание платежа');
      }
      throw err;
    }
  }

  async handleYooKassaWebhook(payload: unknown): Promise<void> {
    const event = extractYooKassaPaymentEvent(payload);
    const order = event.orderId
      ? await this.deps.repository.findPaymentOrderById(event.orderId)
      : await this.deps.repository.findPaymentOrderByProviderPaymentId(
          event.providerPaymentId
        );
    if (!order) {
      // Неизвестный заказ: отвечаем 200, иначе YooKassa будет ретраить
      // вечно, а злоумышленник получит сигнал для перебора.
      console.warn('[billing] yookassa webhook: unknown order', {
        providerPaymentId: event.providerPaymentId,
        event: event.event,
      });
      return;
    }

    // КРИТИЧНО: телу вебхука доверять нельзя (его может подделать кто угодно).
    // Подтверждаем статус и сумму ОБРАТНЫМ запросом в YooKassa.
    this.requireYooKassaConfig();
    const verified = await getYooKassaPayment(
      this.deps.config.yookassa,
      event.providerPaymentId
    );
    await this.applyVerifiedYooKassaPayment(order, verified, event.event);
  }

  async reconcileYooKassaCheckout(params: {
    userId: string | null | undefined;
    orderId?: string | null;
  }): Promise<BillingPaymentStatusResponse> {
    if (!params.userId) {
      throw apiError('E_AUTH', 'Для проверки оплаты войдите в профиль');
    }

    const order = params.orderId
      ? await this.deps.repository.findPaymentOrderById(params.orderId)
      : await this.deps.repository.findLatestPaymentOrderByUserId(
          params.userId
        );

    if (!order) {
      return await this.buildCheckoutStatus({
        order: null,
        providerStatus: null,
        paid: false,
        providerVerified: false,
        shouldContinuePolling: false,
        userId: params.userId,
      });
    }

    if (order.userId !== params.userId) {
      throw apiError('E_NOT_FOUND', 'Платёжный заказ не найден');
    }

    if (!order.providerPaymentId) {
      return await this.buildCheckoutStatus({
        order,
        providerStatus: null,
        paid: false,
        providerVerified: false,
        shouldContinuePolling: isPendingPaymentStatus(order.status),
        userId: params.userId,
      });
    }

    this.requireYooKassaConfig();
    const verified = await getYooKassaPayment(
      this.deps.config.yookassa,
      order.providerPaymentId
    );

    return await this.applyVerifiedYooKassaPayment(
      order,
      verified,
      'checkout-status'
    );
  }

  // Явная привязка карты БЕЗ платежа (по образцу Mentala): создаём
  // payment_method в YooKassa, сохраняем pending-запись и отправляем
  // пользователя на страницу подтверждения банка.
  async startPaymentMethodBinding(
    userId: string | null | undefined
  ): Promise<{ confirmationUrl: string }> {
    if (!userId) {
      throw apiError('E_AUTH', 'Войдите в профиль');
    }
    this.requireYooKassaConfig();

    const binding = await createYooKassaPaymentMethodBinding({
      ...this.deps.config.yookassa,
      idempotenceKey: `bind-${userId}-${Date.now()}`,
      returnUrl: buildBindingReturnUrl(this.deps.config.appUrl),
    });
    const confirmationUrl = binding.confirmation?.confirmation_url;
    if (!binding.id || !confirmationUrl) {
      throw apiError(
        'E_UPSTREAM',
        'YooKassa не вернула ссылку для привязки карты. Проверьте, что для магазина включено сохранение платёжных методов.'
      );
    }

    await this.deps.repository.savePendingPaymentMethod({
      userId,
      providerPaymentMethodId: binding.id,
    });

    return { confirmationUrl };
  }

  // Синхронизация pending-привязки (вызывается опортунистически из
  // /api/billing/status, как syncPendingPaymentMethodBinding в Mentala).
  async syncPendingPaymentMethod(
    userId: string | null | undefined
  ): Promise<void> {
    if (!userId) return;
    const method = await this.deps.repository.findPaymentMethodByUserId(userId);
    if (!method || method.status !== 'pending') return;

    this.requireYooKassaConfig();
    const remote = await getYooKassaPaymentMethod(
      this.deps.config.yookassa,
      method.providerPaymentMethodId
    );

    if (remote.saved === true || remote.status === 'active') {
      await this.deps.repository.activatePaymentMethod({
        userId,
        providerPaymentMethodId: remote.id,
        methodType: remote.type ?? null,
        title: remote.title ?? null,
        cardBrand: remote.card?.card_type ?? null,
        cardLast4: remote.card?.last4 ?? null,
        cardExpiryMonth: remote.card?.expiry_month ?? null,
        cardExpiryYear: remote.card?.expiry_year ?? null,
      });
      // Карта появилась — включаем автопродление активной подписки.
      const subscriptionIds = await this.findActiveRecurringSubscriptionIds(
        userId
      );
      if (subscriptionIds.length > 0) {
        await this.deps.repository.setSubscriptionAutoRenew({
          userId,
          autoRenew: true,
          subscriptionIds,
        });
      }
      return;
    }

    // Привязка отклонена/протухла — убираем pending-запись.
    if (remote.status === 'inactive' || remote.status === 'canceled') {
      await this.deps.repository.deletePaymentMethodByUserId(userId);
    }
  }

  // Отвязка карты: удаляем способ оплаты и выключаем автопродление.
  // Текущий оплаченный период остаётся активным до конца.
  async unbindPaymentMethod(userId: string | null | undefined): Promise<void> {
    if (!userId) {
      throw apiError('E_AUTH', 'Войдите в профиль');
    }
    await this.deps.repository.deletePaymentMethodByUserId(userId);
    await this.deps.repository.setSubscriptionAutoRenew({
      userId,
      autoRenew: false,
    });
  }

  async setAutoRenew(params: {
    userId: string | null | undefined;
    enabled: boolean;
  }): Promise<void> {
    if (!params.userId) {
      throw apiError('E_AUTH', 'Войдите в профиль');
    }
    let subscriptionIds: string[] | undefined;
    if (params.enabled) {
      const method = await this.deps.repository.findPaymentMethodByUserId(
        params.userId
      );
      if (!method || method.status !== 'active') {
        throw apiError(
          'E_VALIDATION',
          'Сначала привяжите карту — автопродление списывает оплату с неё'
        );
      }
      subscriptionIds = await this.findActiveRecurringSubscriptionIds(
        params.userId
      );
      if (subscriptionIds.length === 0) return;
    }
    await this.deps.repository.setSubscriptionAutoRenew({
      userId: params.userId,
      autoRenew: params.enabled,
      ...(subscriptionIds ? { subscriptionIds } : {}),
    });
  }

  private async findActiveRecurringSubscriptionIds(
    userId: string
  ): Promise<string[]> {
    const active =
      await this.deps.repository.findActiveSubscriptionsByUserId(userId);
    return active
      .filter(
        (subscription) =>
          getBillingPlan(subscription.planId).kind === 'subscription'
      )
      .map((subscription) => subscription.id);
  }

  // Автопродление при обращении пользователя к биллинг-статусу (по образцу
  // Mentala). Работает как бэкап к фоновому обходу runAutoRenewalSweep.
  // Безопасно вызывать часто: claim-паттерн не даст списать дважды.
  async maybeRunAutoRenewal(userId: string | null | undefined): Promise<void> {
    if (!userId) return;
    const now = new Date();
    const [due] = await this.deps.repository.listSubscriptionsDueForCharge({
      userId,
      now,
      retryAfterMs: AUTO_RENEW_RETRY_AFTER_MS,
      limit: 1,
      planIds: AUTO_RENEW_PLAN_IDS,
    });
    if (!due || getBillingPlan(due.planId).kind !== 'subscription') return;

    await this.chargeSubscription(due, now);
  }

  // Фоновый обход подписок, которым пора автосписание (вызывается из
  // воркера/интервала). Ошибка по одной подписке не прерывает остальные.
  async runAutoRenewalSweep(params?: {
    limit?: number;
    now?: Date;
  }): Promise<{ processed: number; failed: number }> {
    const now = params?.now ?? new Date();
    const due = await this.deps.repository.listSubscriptionsDueForCharge({
      now,
      retryAfterMs: AUTO_RENEW_RETRY_AFTER_MS,
      limit: params?.limit ?? 50,
      planIds: AUTO_RENEW_PLAN_IDS,
    });

    let processed = 0;
    let failed = 0;
    for (const subscription of due) {
      try {
        if (getBillingPlan(subscription.planId).kind !== 'subscription') {
          continue;
        }
        await this.chargeSubscription(subscription, now);
        processed += 1;
      } catch (err) {
        failed += 1;
        console.error('[billing] renewal sweep item failed', {
          subscriptionId: subscription.id,
          err,
        });
      }
    }
    if (processed > 0 || failed > 0) {
      console.info('[billing] renewal sweep done', { processed, failed });
    }
    return { processed, failed };
  }

  // Одна попытка автосписания по подписке. Claim-паттерн гарантирует,
  // что параллельные вызовы (крон + опортунистический) не спишут дважды.
  private async chargeSubscription(
    due: SubscriptionRecord,
    now: Date
  ): Promise<void> {
    const userId = due.userId;
    const claimed = await this.deps.repository.claimSubscriptionForCharge({
      subscriptionId: due.id,
      retryAfterMs: AUTO_RENEW_RETRY_AFTER_MS,
      now,
    });
    if (!claimed) return;

    const method = await this.deps.repository.findPaymentMethodByUserId(userId);
    if (!method || method.status !== 'active') {
      await this.deps.repository.setSubscriptionAutoRenew({
        userId,
        autoRenew: false,
        now,
      });
      return;
    }

    this.requireYooKassaConfig();
    const plan = getBillingPlan(due.planId);
    const order = await this.deps.repository.createPaymentOrder({
      userId,
      planId: plan.id,
      amountRub: plan.priceRub,
      currency: 'RUB',
      metadata: {
        userId,
        planId: plan.id,
        renewal: true,
        subscriptionId: due.id,
      },
    });

    try {
      const email = await this.deps.repository.findUserEmail(userId);
      const description = `Гласно ${plan.name} (автопродление)`;
      const payment = await createYooKassaRecurringPayment({
        ...this.deps.config.yookassa,
        idempotenceKey: order.id,
        amountRub: plan.priceRub,
        description,
        paymentMethodId: method.providerPaymentMethodId,
        metadata: {
          orderId: order.id,
          userId,
          planId: plan.id,
        },
        receipt: email
          ? buildYooKassaReceipt({
              email,
              amountRub: plan.priceRub,
              description,
            })
          : undefined,
      });

      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        providerPaymentId: payment.id,
        status: payment.status || 'pending',
      });

      // Верифицируем и выдаём продление тем же путём, что и обычные оплаты.
      const verified = await getYooKassaPayment(
        this.deps.config.yookassa,
        payment.id
      );
      await this.applyVerifiedYooKassaPayment(order, verified, 'auto-renewal');

      if (verified.status === 'canceled' || verified.status === 'failed') {
        await this.deps.repository.recordSubscriptionChargeError({
          subscriptionId: due.id,
          error: `Списание отклонено (${verified.status})`,
          now,
        });
      }
    } catch (err) {
      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        status: 'failed',
      });
      await this.deps.repository.recordSubscriptionChargeError({
        subscriptionId: due.id,
        error:
          err instanceof Error ? err.message : 'Не удалось выполнить списание',
        now,
      });
      console.error('[billing] auto-renewal charge failed', {
        userId,
        subscriptionId: due.id,
        err,
      });
    }
  }

  private requireYooKassaConfig() {
    if (
      !this.deps.config.yookassa.shopId ||
      !this.deps.config.yookassa.secretKey
    ) {
      throw apiError('E_UPSTREAM', 'NUXT_YOOKASSA_* не заданы');
    }
  }

  private async applyVerifiedYooKassaPayment(
    order: PaymentOrderRecord,
    verified: Awaited<ReturnType<typeof getYooKassaPayment>>,
    source: string
  ): Promise<BillingPaymentStatusResponse> {
    // getBillingPlan (не getPaidBillingPlan): legacy-тарифы с выключенной
    // продажей всё ещё должны корректно обслуживать старые оплаченные заказы.
    const plan = getBillingPlan(order.planId);
    const expectedAmount = order.amountRub.toFixed(2);
    const amountOk =
      verified.amountValue === expectedAmount && verified.currency === 'RUB';
    const paymentOk =
      verified.status === 'succeeded' && verified.paid && amountOk;

    await this.deps.repository.updatePaymentOrder({
      id: order.id,
      providerPaymentId: verified.id,
      status: verified.status,
      metadata: {
        ...(order.metadata || {}),
        paymentStatusSource: source,
        verifiedStatus: verified.status,
        verifiedAmount: verified.amountValue,
        verifiedCurrency: verified.currency,
        amountMatched: amountOk,
      },
    });

    if (paymentOk) {
      // Пакет минут не должен жить дольше самого доступа: пользователю
      // только с разовым тарифом обрезаем срок пакета концом этого доступа.
      // Подписчикам оставляем полные periodDays — их период продлится
      // автосписанием.
      let maxExpiresAt: Date | null = null;
      if (plan.kind === 'addon') {
        const now = new Date();
        const activeSubscriptions =
          await this.deps.repository.findActiveSubscriptionsByUserId(
            order.userId,
            now
          );
        const hasBaseSubscription = activeSubscriptions.some(
          (subscription) =>
            getBillingPlan(subscription.planId).kind === 'subscription'
        );
        if (!hasBaseSubscription) {
          const oneTimeEnds = activeSubscriptions
            .filter(
              (subscription) =>
                getBillingPlan(subscription.planId).kind === 'one_time'
            )
            .map((subscription) => subscription.currentPeriodEnd.getTime());
          if (oneTimeEnds.length > 0) {
            maxExpiresAt = new Date(
              Math.min(
                addDaysTo(now, plan.periodDays).getTime(),
                Math.max(...oneTimeEnds)
              )
            );
          }
        }
      }
      // Идемпотентно: заказ блокируется в транзакции, повторный вызов
      // (вебхук + поллинг) доступ второй раз не выдаст.
      const savedMethod =
        verified.paymentMethod?.saved && verified.paymentMethod.id
          ? {
              providerPaymentMethodId: verified.paymentMethod.id,
              methodType: verified.paymentMethod.methodType,
              title: verified.paymentMethod.title,
              cardBrand: verified.paymentMethod.cardBrand,
              cardLast4: verified.paymentMethod.cardLast4,
              cardExpiryMonth: verified.paymentMethod.cardExpiryMonth,
              cardExpiryYear: verified.paymentMethod.cardExpiryYear,
            }
          : null;
      await this.deps.repository.fulfillPaidOrder({
        orderId: order.id,
        providerPaymentId: verified.id,
        plan: {
          id: plan.id,
          kind: plan.kind,
          periodDays: plan.periodDays,
          realtimeVoiceMinutes: plan.realtimeVoiceMinutes,
        },
        paymentMethod: savedMethod,
        maxExpiresAt,
      });
    }

    return await this.buildCheckoutStatus({
      order: {
        ...order,
        providerPaymentId: verified.id,
        status: verified.status,
      },
      providerStatus: verified.status,
      paid: verified.paid,
      providerVerified: true,
      shouldContinuePolling: isPendingPaymentStatus(verified.status),
      userId: order.userId,
    });
  }

  private async buildCheckoutStatus(params: {
    order: PaymentOrderRecord | null;
    providerStatus: string | null;
    paid: boolean;
    providerVerified: boolean;
    shouldContinuePolling: boolean;
    userId: string;
  }): Promise<BillingPaymentStatusResponse> {
    const activeSubscription =
      await this.deps.repository.findActiveSubscriptionByUserId(params.userId);

    return {
      provider: 'yookassa',
      orderId: params.order?.id ?? null,
      localStatus: params.order?.status ?? 'none',
      providerPaymentId: params.order?.providerPaymentId ?? null,
      providerStatus: params.providerStatus,
      paid: params.paid,
      providerVerified: params.providerVerified,
      hasActiveSubscription: Boolean(activeSubscription),
      subscriptionExpiresAt:
        activeSubscription?.currentPeriodEnd.toISOString() ?? null,
      shouldContinuePolling: params.shouldContinuePolling,
    };
  }
}

function isPendingPaymentStatus(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'waiting_for_capture';
}

function buildYooKassaReturnUrl(appUrl: string, orderId: string): string {
  const url = new URL('/pricing', `${appUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('payment', 'return');
  url.searchParams.set('orderId', orderId);
  return url.toString();
}

function buildBindingReturnUrl(appUrl: string): string {
  const url = new URL('/pricing', `${appUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('binding', 'return');
  return url.toString();
}

function addDaysTo(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

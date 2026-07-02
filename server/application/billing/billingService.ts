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
} from '@/server/interface/billingRepository';
import { BillingAccessService } from './accessService';
import {
  getPaidBillingPlan,
  getPublicBillingPlans,
} from './plans';
import {
  createYooKassaPayment,
  extractYooKassaPaymentEvent,
  getYooKassaConfirmationUrl,
  getYooKassaPayment,
  type YooKassaConfig,
} from './yookassaClient';

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

    try {
      const payment = await createYooKassaPayment({
        ...this.deps.config.yookassa,
        idempotenceKey: order.id,
        amountRub: plan.priceRub,
        returnUrl: buildYooKassaReturnUrl(this.deps.config.appUrl, order.id),
        description: `JobAI ${plan.name}`,
        metadata: {
          orderId: order.id,
          userId: params.userId,
          planId: plan.id,
        },
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
      throw apiError('E_NOT_FOUND', 'Платёжный заказ не найден');
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
    const plan = getPaidBillingPlan(order.planId);
    const expectedAmount = order.amountRub.toFixed(2);
    const amountOk =
      verified.amountValue === expectedAmount &&
      (verified.currency === 'RUB' || verified.currency === null);
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
      const existingSubscription =
        await this.deps.repository.findSubscriptionByProviderPaymentId(
          verified.id
        );

      if (!existingSubscription) {
        await this.deps.repository.grantSubscription({
          userId: order.userId,
          planId: plan.id,
          provider: 'yookassa',
          providerPaymentId: verified.id,
          currentPeriodEnd: addDays(new Date(), plan.periodDays),
        });
      }
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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

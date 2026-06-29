import type {
  BillingCheckoutResponse,
  BillingPlansResponse,
  BillingStatusResponse,
} from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type {
  BillingOwner,
  BillingRepository,
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
        returnUrl: `${this.deps.config.appUrl.replace(/\/$/, '')}/pricing?payment=return`,
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
    const plan = getPaidBillingPlan(order.planId);
    const expectedAmount = plan.priceRub.toFixed(2);
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
        webhookEvent: event.event,
        verifiedStatus: verified.status,
        verifiedAmount: verified.amountValue,
      },
    });

    // Грант только если YooKassa реально подтвердила оплату нужной суммы.
    if (!paymentOk) return;

    await this.deps.repository.grantSubscription({
      userId: order.userId,
      planId: plan.id,
      provider: 'yookassa',
      providerPaymentId: verified.id,
      currentPeriodEnd: addDays(new Date(), plan.periodDays),
    });
  }

  private requireYooKassaConfig() {
    if (
      !this.deps.config.yookassa.shopId ||
      !this.deps.config.yookassa.secretKey
    ) {
      throw apiError('E_UPSTREAM', 'NUXT_YOOKASSA_* не заданы');
    }
  }
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}


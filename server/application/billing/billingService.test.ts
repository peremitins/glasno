import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingService } from './billingService';
import { getYooKassaPayment } from './yookassaClient';
import type {
  BillingRepository,
  PaymentOrderRecord,
  SubscriptionRecord,
} from '@/server/interface/billingRepository';

vi.mock('./yookassaClient', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./yookassaClient')>();
  return {
    ...actual,
    getYooKassaPayment: vi.fn(),
  };
});

const mockedGetYooKassaPayment = vi.mocked(getYooKassaPayment);

function createOrder(
  overrides: Partial<PaymentOrderRecord> = {}
): PaymentOrderRecord {
  return {
    id: 'order_1',
    userId: 'user_1',
    planId: 'pro_monthly',
    provider: 'yookassa',
    providerPaymentId: 'payment_1',
    status: 'pending',
    amountRub: 990,
    currency: 'RUB',
    confirmationUrl: 'https://yookassa.test/payments/payment_1',
    metadata: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    ...overrides,
  };
}

function createSubscription(
  overrides: Partial<SubscriptionRecord> = {}
): SubscriptionRecord {
  return {
    id: 'subscription_1',
    userId: 'user_1',
    planId: 'pro_monthly',
    status: 'active',
    provider: 'yookassa',
    providerPaymentId: 'payment_1',
    currentPeriodEnd: new Date('2026-07-31T10:00:00.000Z'),
    autoRenew: false,
    nextChargeAt: null,
    lastChargeAttemptAt: null,
    lastChargeError: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    ...overrides,
  };
}

function createRepository(order = createOrder()) {
  let activeSubscription: SubscriptionRecord | null = null;
  let fulfilledAt: Date | null = null;
  const repository = {
    countOwnerSessions: vi.fn().mockResolvedValue(1),
    countOwnerSessionsSince: vi.fn().mockResolvedValue(0),
    findUserEmail: vi.fn().mockResolvedValue('user@example.com'),
    findActiveSubscriptionByUserId: vi
      .fn()
      .mockImplementation(async () => activeSubscription),
    findActiveSubscriptionsByUserId: vi
      .fn()
      .mockImplementation(async () =>
        activeSubscription ? [activeSubscription] : []
      ),
    countRealtimeVoiceUsageSeconds: vi.fn().mockResolvedValue(0),
    getRealtimeMinuteBalance: vi.fn().mockResolvedValue({
      totalSeconds: 0,
      consumedSeconds: 0,
      remainingSeconds: 0,
    }),
    debitRealtimeSeconds: vi.fn().mockResolvedValue(undefined),
    createPaymentOrder: vi.fn(),
    findPaymentOrderById: vi.fn().mockResolvedValue(order),
    findPaymentOrderByProviderPaymentId: vi.fn().mockResolvedValue(order),
    findLatestPaymentOrderByUserId: vi.fn().mockResolvedValue(order),
    updatePaymentOrder: vi.fn().mockResolvedValue(order),
    findSubscriptionByProviderPaymentId: vi.fn().mockResolvedValue(null),
    findPaymentMethodByUserId: vi.fn().mockResolvedValue(null),
    savePendingPaymentMethod: vi.fn().mockResolvedValue(undefined),
    activatePaymentMethod: vi.fn().mockResolvedValue(undefined),
    deletePaymentMethodByUserId: vi.fn().mockResolvedValue(undefined),
    setSubscriptionAutoRenew: vi.fn().mockResolvedValue(undefined),
    claimSubscriptionForCharge: vi.fn().mockResolvedValue(null),
    recordSubscriptionChargeError: vi.fn().mockResolvedValue(undefined),
    grantSubscription: vi.fn().mockImplementation(async (input) => {
      activeSubscription = createSubscription(input);
      return activeSubscription;
    }),
    // Эмуляция идемпотентности продовой реализации: повторный вызов
    // по тому же заказу доступ не выдаёт.
    fulfillPaidOrder: vi.fn().mockImplementation(async (params) => {
      if (fulfilledAt) {
        return { fulfilled: false, alreadyFulfilled: true };
      }
      fulfilledAt = new Date();
      activeSubscription = createSubscription({
        planId: params.plan.id,
        providerPaymentId: params.providerPaymentId,
      });
      return { fulfilled: true, alreadyFulfilled: false };
    }),
  } satisfies BillingRepository;

  return repository;
}

function createService(repository: ReturnType<typeof createRepository>) {
  return new BillingService({
    repository,
    config: {
      yookassa: { shopId: '123456', secretKey: 'test_secret' },
      appUrl: 'https://glasno.test',
    },
  });
}

describe('BillingService payment reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T10:00:00.000Z'));
  });

  it('reconciles a paid YooKassa checkout and grants access when webhook did not update the order', async () => {
    const repository = createRepository();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '990.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await expect(
      service.reconcileYooKassaCheckout({
        userId: 'user_1',
        orderId: 'order_1',
      })
    ).resolves.toMatchObject({
      orderId: 'order_1',
      localStatus: 'succeeded',
      providerStatus: 'succeeded',
      paid: true,
      providerVerified: true,
      hasActiveSubscription: true,
      shouldContinuePolling: false,
    });

    expect(repository.fulfillPaidOrder).toHaveBeenCalledWith({
      orderId: 'order_1',
      providerPaymentId: 'payment_1',
      plan: {
        id: 'pro_monthly',
        kind: 'subscription',
        periodDays: 30,
        realtimeVoiceMinutes: 60,
      },
      paymentMethod: null,
    });
  });

  it('does not grant access twice for the same YooKassa payment', async () => {
    const repository = createRepository();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '990.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    // Гонка «вебхук + поллинг»: оба пути пытаются выдать доступ.
    await service.handleYooKassaWebhook({
      event: 'payment.succeeded',
      object: {
        id: 'payment_1',
        status: 'succeeded',
        paid: true,
        metadata: { orderId: 'order_1' },
      },
    });
    await expect(
      service.reconcileYooKassaCheckout({
        userId: 'user_1',
        orderId: 'order_1',
      })
    ).resolves.toMatchObject({
      hasActiveSubscription: true,
      shouldContinuePolling: false,
    });

    expect(repository.fulfillPaidOrder).toHaveBeenCalledTimes(2);
    const results = await Promise.all(
      repository.fulfillPaidOrder.mock.results.map((item) => item.value)
    );
    expect(results.filter((result) => result.fulfilled)).toHaveLength(1);
  });

  it('ignores webhooks for unknown orders without throwing', async () => {
    const repository = createRepository();
    repository.findPaymentOrderById.mockResolvedValue(null);
    repository.findPaymentOrderByProviderPaymentId.mockResolvedValue(null);
    const service = createService(repository);

    await expect(
      service.handleYooKassaWebhook({
        event: 'payment.succeeded',
        object: { id: 'payment_unknown', status: 'succeeded', paid: true },
      })
    ).resolves.toBeUndefined();
    expect(repository.fulfillPaidOrder).not.toHaveBeenCalled();
    expect(mockedGetYooKassaPayment).not.toHaveBeenCalled();
  });

  it('refuses to activate access when YooKassa amount differs from the order', async () => {
    const repository = createRepository();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await expect(
      service.reconcileYooKassaCheckout({
        userId: 'user_1',
        orderId: 'order_1',
      })
    ).resolves.toMatchObject({
      providerStatus: 'succeeded',
      paid: true,
      hasActiveSubscription: false,
      shouldContinuePolling: false,
    });

    expect(repository.fulfillPaidOrder).not.toHaveBeenCalled();
    expect(repository.updatePaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          amountMatched: false,
        }),
      })
    );
  });

  it('refuses to activate access when currency is missing', async () => {
    const repository = createRepository();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '990.00',
      currency: null,
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await service.reconcileYooKassaCheckout({
      userId: 'user_1',
      orderId: 'order_1',
    });
    expect(repository.fulfillPaidOrder).not.toHaveBeenCalled();
  });
});

describe('BillingService checkout guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('blocks minute pack purchase without an active base subscription', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createCheckout({ userId: 'user_1', planId: 'realtime_pack_60' })
    ).rejects.toThrow('Пакеты минут доступны при активном тарифе');
    expect(repository.createPaymentOrder).not.toHaveBeenCalled();
  });

  it('rejects checkout of the legacy realtime_voice_60 plan', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createCheckout({ userId: 'user_1', planId: 'realtime_voice_60' })
    ).rejects.toThrow();
    expect(repository.createPaymentOrder).not.toHaveBeenCalled();
  });
});

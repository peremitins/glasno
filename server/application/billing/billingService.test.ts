import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingService } from './billingService';
import {
  createYooKassaPayment,
  createYooKassaRecurringPayment,
  getYooKassaPayment,
  getYooKassaPaymentMethod,
} from './yookassaClient';
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
    getYooKassaPaymentMethod: vi.fn(),
    createYooKassaPayment: vi.fn(),
    createYooKassaRecurringPayment: vi.fn(),
  };
});

const mockedGetYooKassaPayment = vi.mocked(getYooKassaPayment);
const mockedGetYooKassaPaymentMethod = vi.mocked(getYooKassaPaymentMethod);
const mockedCreateYooKassaPayment = vi.mocked(createYooKassaPayment);
const mockedCreateYooKassaRecurringPayment = vi.mocked(
  createYooKassaRecurringPayment
);

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
    createGiftPaymentOrder: vi.fn(),
    findGiftEntitlementByOrderId: vi.fn().mockResolvedValue(null),
    markGiftOrderPaid: vi.fn().mockResolvedValue(null),
    cancelGiftOrder: vi.fn().mockResolvedValue(undefined),
    claimReadyGiftsByEmail: vi.fn().mockResolvedValue([]),
    listPaymentOrdersByUserId: vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    }),
    claimGiftNotifications: vi.fn().mockResolvedValue([]),
    markGiftNotificationSent: vi.fn().mockResolvedValue(undefined),
    markGiftNotificationFailed: vi.fn().mockResolvedValue(undefined),
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
    listSubscriptionsDueForCharge: vi.fn().mockResolvedValue([]),
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
      maxExpiresAt: null,
    });
  });

  it('marks a paid gift ready without granting access to the purchaser', async () => {
    const order = createOrder({ metadata: { gift: true } });
    const repository = createRepository(order);
    const readyGift = {
      id: 'gift_1',
      orderId: 'order_1',
      purchaserUserId: 'user_1',
      recipientEmail: 'friend@example.com',
      senderName: 'Николай',
      planId: 'pro_monthly',
      status: 'ready' as const,
      paidAt: new Date('2026-07-01T10:00:00.000Z'),
      claimExpiresAt: new Date('2027-01-01T10:00:00.000Z'),
      claimedAt: null,
      claimedByUserId: null,
      notificationStatus: 'pending' as const,
      notificationAttempts: 0,
      notificationNextAttemptAt: new Date('2026-07-01T10:00:00.000Z'),
      notificationSentAt: null,
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    };
    repository.markGiftOrderPaid.mockResolvedValue(readyGift);
    repository.findGiftEntitlementByOrderId.mockResolvedValue(readyGift);
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
      paid: true,
      hasActiveSubscription: false,
      purchaseType: 'gift',
      gift: {
        recipientEmailMasked: 'fr***@example.com',
        status: 'ready',
        notificationStatus: 'pending',
      },
    });

    expect(repository.markGiftOrderPaid).toHaveBeenCalledWith({
      orderId: 'order_1',
      providerPaymentId: 'payment_1',
      paidAt: new Date('2026-07-01T10:00:00.000Z'),
      claimExpiresAt: new Date('2027-01-01T10:00:00.000Z'),
    });
    expect(repository.fulfillPaidOrder).not.toHaveBeenCalled();
  });

  it('cancels the gift entitlement when YooKassa cancels payment', async () => {
    const order = createOrder({ metadata: { gift: true } });
    const repository = createRepository(order);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'canceled',
      paid: false,
      amountValue: '990.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await service.reconcileYooKassaCheckout({
      userId: 'user_1',
      orderId: 'order_1',
    });

    expect(repository.cancelGiftOrder).toHaveBeenCalledWith({
      orderId: 'order_1',
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
  });

  it('caps addon minutes by the latest one-time access end and the addon period', async () => {
    const order = createOrder({
      planId: 'realtime_pack_60',
      amountRub: 890,
    });
    const repository = createRepository(order);
    repository.findActiveSubscriptionsByUserId.mockResolvedValue([
      createSubscription({
        id: 'one_time_1',
        planId: 'single_prep',
        currentPeriodEnd: new Date('2026-08-05T10:00:00.000Z'),
      }),
      createSubscription({
        id: 'one_time_2',
        planId: 'single_prep',
        currentPeriodEnd: new Date('2026-08-10T10:00:00.000Z'),
      }),
    ]);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '890.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await service.reconcileYooKassaCheckout({
      userId: 'user_1',
      orderId: 'order_1',
    });

    expect(repository.fulfillPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        maxExpiresAt: new Date('2026-07-31T10:00:00.000Z'),
      })
    );
  });

  it('uses the latest active one-time access end when it is earlier than the addon period', async () => {
    const order = createOrder({
      planId: 'realtime_pack_60',
      amountRub: 890,
    });
    const repository = createRepository(order);
    repository.findActiveSubscriptionsByUserId.mockResolvedValue([
      createSubscription({
        id: 'one_time_1',
        planId: 'single_prep',
        currentPeriodEnd: new Date('2026-07-05T10:00:00.000Z'),
      }),
      createSubscription({
        id: 'one_time_2',
        planId: 'single_prep',
        currentPeriodEnd: new Date('2026-07-08T10:00:00.000Z'),
      }),
    ]);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '890.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await service.reconcileYooKassaCheckout({
      userId: 'user_1',
      orderId: 'order_1',
    });

    expect(repository.fulfillPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        maxExpiresAt: new Date('2026-07-08T10:00:00.000Z'),
      })
    );
  });

  it('does not cap addon minutes when an active subscription exists', async () => {
    const order = createOrder({
      planId: 'realtime_pack_60',
      amountRub: 890,
    });
    const repository = createRepository(order);
    repository.findActiveSubscriptionsByUserId.mockResolvedValue([
      createSubscription({
        id: 'one_time_1',
        planId: 'single_prep',
        currentPeriodEnd: new Date('2026-07-05T10:00:00.000Z'),
      }),
      createSubscription({
        id: 'pro_1',
        planId: 'pro_monthly',
        currentPeriodEnd: new Date('2026-07-20T10:00:00.000Z'),
      }),
    ]);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '890.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await service.reconcileYooKassaCheckout({
      userId: 'user_1',
      orderId: 'order_1',
    });

    expect(repository.fulfillPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({ maxExpiresAt: null })
    );
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

describe('BillingService payment history', () => {
  it('maps gift state and preserves the repository cursor', async () => {
    const repository = createRepository();
    repository.listPaymentOrdersByUserId.mockResolvedValue({
      items: [
        {
          order: createOrder({ status: 'succeeded' }),
          gift: {
            id: 'gift_1',
            orderId: 'order_1',
            purchaserUserId: 'user_1',
            recipientEmail: 'friend@example.com',
            senderName: 'Николай',
            planId: 'pro_monthly',
            status: 'ready',
            paidAt: new Date('2026-07-01T10:00:00.000Z'),
            claimExpiresAt: new Date('2027-01-01T10:00:00.000Z'),
            claimedAt: null,
            claimedByUserId: null,
            notificationStatus: 'sent',
            notificationAttempts: 1,
            notificationNextAttemptAt: null,
            notificationSentAt: new Date('2026-07-01T10:01:00.000Z'),
            createdAt: new Date('2026-07-01T10:00:00.000Z'),
            updatedAt: new Date('2026-07-01T10:01:00.000Z'),
          },
        },
      ],
      nextCursor: 'cursor_2',
    });
    const service = createService(repository);

    await expect(
      service.getPaymentHistory({ userId: 'user_1', cursor: null, limit: 20 })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'order_1',
          planName: 'Pro',
          status: 'succeeded',
          gift: expect.objectContaining({
            recipientEmailMasked: 'fr***@example.com',
            status: 'ready',
            notificationStatus: 'sent',
          }),
        }),
      ],
      nextCursor: 'cursor_2',
    });
  });
});

describe('BillingService checkout guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('blocks minute pack purchase without an active paid plan', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createCheckout({ userId: 'user_1', planId: 'realtime_pack_60' })
    ).rejects.toMatchObject({
      message: 'Пакеты минут доступны только при активном платном тарифе',
    });
    expect(repository.createPaymentOrder).not.toHaveBeenCalled();
  });

  it('allows minute pack purchase with an active one-time plan', async () => {
    const repository = createRepository();
    repository.findActiveSubscriptionsByUserId.mockResolvedValue([
      createSubscription({ planId: 'single_prep' }),
    ]);
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ planId: 'realtime_pack_60', amountRub: 890 })
    );
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_addon_1',
      status: 'pending',
      confirmation: {
        type: 'redirect',
        confirmation_url: 'https://yookassa.test/payments/payment_addon_1',
      },
    });
    const service = createService(repository);

    await expect(
      service.createCheckout({ userId: 'user_1', planId: 'realtime_pack_60' })
    ).resolves.toEqual({
      provider: 'yookassa',
      orderId: 'order_1',
      confirmationUrl: 'https://yookassa.test/payments/payment_addon_1',
    });
    expect(repository.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        planId: 'realtime_pack_60',
      })
    );
  });

  it('allows an administrator to buy a minute pack without a paid subscription', async () => {
    const repository = createRepository();
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ planId: 'realtime_pack_60', amountRub: 890 })
    );
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_admin_addon_1',
      status: 'pending',
      confirmation: {
        type: 'redirect',
        confirmation_url:
          'https://yookassa.test/payments/payment_admin_addon_1',
      },
    });
    const service = createService(repository);

    await expect(
      service.createCheckout({
        userId: 'admin_1',
        role: 'admin',
        planId: 'realtime_pack_60',
      })
    ).resolves.toEqual({
      provider: 'yookassa',
      orderId: 'order_1',
      confirmationUrl:
        'https://yookassa.test/payments/payment_admin_addon_1',
    });
  });

  it('requests payment-method saving for Pro auto-renewal by default', async () => {
    const repository = createRepository();
    repository.createPaymentOrder.mockResolvedValue(createOrder());
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_pro_1',
      status: 'pending',
      confirmation: {
        type: 'redirect',
        confirmation_url: 'https://yookassa.test/payments/payment_pro_1',
      },
    });
    const service = createService(repository);

    await service.createCheckout({ userId: 'user_1', planId: 'pro_monthly' });

    expect(mockedCreateYooKassaPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        savePaymentMethod: true,
      })
    );
  });

  it('creates a gift checkout without saving a payment method or leaking recipient email to YooKassa metadata', async () => {
    const repository = createRepository();
    repository.createGiftPaymentOrder.mockResolvedValue({
      order: createOrder({ metadata: { gift: true } }),
      gift: {
        id: 'gift_1',
        orderId: 'order_1',
        purchaserUserId: 'user_1',
        recipientEmail: 'friend@example.com',
        senderName: 'Николай',
        planId: 'pro_monthly',
        status: 'pending_payment',
        paidAt: null,
        claimExpiresAt: null,
        claimedAt: null,
        claimedByUserId: null,
        notificationStatus: 'pending',
        notificationAttempts: 0,
        notificationNextAttemptAt: null,
        notificationSentAt: null,
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        updatedAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    });
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_gift_1',
      status: 'pending',
      confirmation: {
        type: 'redirect',
        confirmation_url: 'https://yookassa.test/payments/payment_gift_1',
      },
    });
    const service = createService(repository);

    await service.createCheckout({
      userId: 'user_1',
      planId: 'pro_monthly',
      gift: { recipientEmail: 'friend@example.com', senderName: 'Николай' },
    });

    expect(repository.createGiftPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaserUserId: 'user_1',
        recipientEmail: 'friend@example.com',
        senderName: 'Николай',
      })
    );
    expect(mockedCreateYooKassaPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        savePaymentMethod: false,
        description: 'Гласно Pro, подарок',
        metadata: {
          orderId: 'order_1',
          userId: 'user_1',
          planId: 'pro_monthly',
          gift: 'true',
        },
      })
    );
    expect(
      mockedCreateYooKassaPayment.mock.calls[0]?.[0].metadata
    ).not.toHaveProperty('recipientEmail');
    expect(
      mockedCreateYooKassaPayment.mock.calls[0]?.[0].metadata
    ).not.toHaveProperty('senderName');
  });

  it('rejects gifting an addon', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createCheckout({
        userId: 'user_1',
        planId: 'realtime_pack_60',
        gift: { recipientEmail: 'friend@example.com', senderName: 'Николай' },
      })
    ).rejects.toMatchObject({
      message: 'Подарить можно только тариф или разовую подготовку',
    });
  });

  it('rejects gifting to the purchaser email', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createCheckout({
        userId: 'user_1',
        planId: 'pro_monthly',
        gift: { recipientEmail: 'USER@example.com', senderName: 'Николай' },
      })
    ).rejects.toMatchObject({
      message: 'Для себя выберите обычную покупку',
    });
  });

  it('cancels the pending gift when YooKassa checkout creation fails', async () => {
    const repository = createRepository();
    repository.createGiftPaymentOrder.mockResolvedValue({
      order: createOrder({ metadata: { gift: true } }),
      gift: {
        id: 'gift_1',
        orderId: 'order_1',
        purchaserUserId: 'user_1',
        recipientEmail: 'friend@example.com',
        senderName: 'Николай',
        planId: 'pro_monthly',
        status: 'pending_payment',
        paidAt: null,
        claimExpiresAt: null,
        claimedAt: null,
        claimedByUserId: null,
        notificationStatus: 'pending',
        notificationAttempts: 0,
        notificationNextAttemptAt: null,
        notificationSentAt: null,
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        updatedAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    });
    mockedCreateYooKassaPayment.mockRejectedValue(new Error('network'));
    const service = createService(repository);

    await expect(
      service.createCheckout({
        userId: 'user_1',
        planId: 'pro_monthly',
        gift: { recipientEmail: 'friend@example.com', senderName: 'Николай' },
      })
    ).rejects.toThrow('network');
    expect(repository.cancelGiftOrder).toHaveBeenCalledWith({
      orderId: 'order_1',
    });
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

describe('BillingService auto-renewal scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('does not enable auto-renewal on one-time access after binding a card', async () => {
    const repository = createRepository();
    repository.findPaymentMethodByUserId.mockResolvedValue({
      id: 'method_1',
      userId: 'user_1',
      provider: 'yookassa',
      providerPaymentMethodId: 'pm_1',
      status: 'pending',
      methodType: null,
      title: null,
      cardBrand: null,
      cardLast4: null,
      cardExpiryMonth: null,
      cardExpiryYear: null,
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
    });
    repository.findActiveSubscriptionsByUserId.mockResolvedValue([
      createSubscription({
        id: 'one_time_1',
        planId: 'single_prep',
      }),
    ]);
    mockedGetYooKassaPaymentMethod.mockResolvedValue({
      id: 'pm_1',
      type: 'bank_card',
      saved: true,
      status: 'active',
      title: 'Bank card *1111',
      card: {
        card_type: 'Visa',
        last4: '1111',
        expiry_month: '12',
        expiry_year: '30',
      },
    });
    const service = createService(repository);

    await service.syncPendingPaymentMethod('user_1');

    expect(repository.activatePaymentMethod).toHaveBeenCalledOnce();
    expect(repository.setSubscriptionAutoRenew).not.toHaveBeenCalled();
  });

  it('passes only active subscription ids when enabling auto-renewal', async () => {
    const repository = createRepository();
    repository.findPaymentMethodByUserId.mockResolvedValue({
      id: 'method_1',
      userId: 'user_1',
      provider: 'yookassa',
      providerPaymentMethodId: 'pm_1',
      status: 'active',
      methodType: 'bank_card',
      title: 'Bank card *1111',
      cardBrand: 'Visa',
      cardLast4: '1111',
      cardExpiryMonth: '12',
      cardExpiryYear: '30',
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
    });
    repository.findActiveSubscriptionsByUserId.mockResolvedValue([
      createSubscription({ id: 'one_time_1', planId: 'single_prep' }),
      createSubscription({ id: 'subscription_pro', planId: 'pro_monthly' }),
    ]);
    const service = createService(repository);

    await service.setAutoRenew({ userId: 'user_1', enabled: true });

    expect(repository.setSubscriptionAutoRenew).toHaveBeenCalledWith({
      userId: 'user_1',
      autoRenew: true,
      subscriptionIds: ['subscription_pro'],
    });
  });
});

describe('BillingService renewal sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T10:00:00.000Z'));
  });

  it('charges a due subscription through the existing renewal sequence', async () => {
    const due = createSubscription({
      autoRenew: true,
      nextChargeAt: new Date('2026-07-31T09:00:00.000Z'),
    });
    const renewalOrder = createOrder({
      id: 'renewal_order_1',
      providerPaymentId: null,
      status: 'pending',
    });
    const repository = createRepository(renewalOrder);
    repository.listSubscriptionsDueForCharge.mockResolvedValue([due]);
    repository.claimSubscriptionForCharge.mockResolvedValue(due);
    repository.findPaymentMethodByUserId.mockResolvedValue({
      id: 'method_1',
      userId: 'user_1',
      provider: 'yookassa',
      providerPaymentMethodId: 'pm_1',
      status: 'active',
      methodType: 'bank_card',
      title: 'Bank card *1111',
      cardBrand: 'Visa',
      cardLast4: '1111',
      cardExpiryMonth: '12',
      cardExpiryYear: '30',
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
    });
    repository.createPaymentOrder.mockResolvedValue(renewalOrder);
    mockedCreateYooKassaRecurringPayment.mockResolvedValue({
      id: 'renewal_payment_1',
      status: 'succeeded',
    });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '990.00',
      currency: 'RUB',
      metadata: { orderId: 'renewal_order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await expect(
      service.runAutoRenewalSweep({
        now: new Date('2026-07-31T10:00:00.000Z'),
        limit: 25,
      })
    ).resolves.toEqual({ processed: 1, failed: 0 });

    expect(repository.listSubscriptionsDueForCharge).toHaveBeenCalledWith({
      now: new Date('2026-07-31T10:00:00.000Z'),
      retryAfterMs: 6 * 60 * 60 * 1000,
      limit: 25,
      planIds: ['pro_monthly', 'career_pack'],
    });
    expect(mockedCreateYooKassaRecurringPayment).toHaveBeenCalledOnce();
    expect(repository.fulfillPaidOrder).toHaveBeenCalledOnce();
  });

  it('uses the due-subscription query for the opportunistic backup', async () => {
    const due = createSubscription({
      autoRenew: true,
      currentPeriodEnd: new Date('2026-07-31T10:00:00.000Z'),
      nextChargeAt: new Date('2026-07-31T10:00:00.000Z'),
    });
    const repository = createRepository();
    repository.listSubscriptionsDueForCharge.mockResolvedValue([due]);
    repository.claimSubscriptionForCharge.mockResolvedValue(null);
    const service = createService(repository);

    await service.maybeRunAutoRenewal('user_1');

    expect(repository.listSubscriptionsDueForCharge).toHaveBeenCalledWith({
      userId: 'user_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
      retryAfterMs: 6 * 60 * 60 * 1000,
      limit: 1,
      planIds: ['pro_monthly', 'career_pack'],
    });
    expect(repository.findActiveSubscriptionsByUserId).not.toHaveBeenCalled();
    expect(repository.claimSubscriptionForCharge).toHaveBeenCalledWith({
      subscriptionId: 'subscription_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
      retryAfterMs: 6 * 60 * 60 * 1000,
    });
  });

  it('continues the sweep when one subscription throws', async () => {
    const first = createSubscription({ id: 'subscription_1' });
    const second = createSubscription({ id: 'subscription_2' });
    const repository = createRepository();
    repository.listSubscriptionsDueForCharge.mockResolvedValue([first, second]);
    repository.claimSubscriptionForCharge
      .mockRejectedValueOnce(new Error('claim failed'))
      .mockResolvedValueOnce(null);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 1,
      failed: 1,
    });
    expect(repository.claimSubscriptionForCharge).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      '[billing] renewal sweep item failed',
      expect.objectContaining({ subscriptionId: 'subscription_1' })
    );

    errorSpy.mockRestore();
  });

  it('isolates plan resolution errors inside the per-item sweep boundary', async () => {
    const unknown = createSubscription({
      id: 'subscription_unknown',
      planId: 'removed_plan',
    });
    const valid = createSubscription({ id: 'subscription_valid' });
    const repository = createRepository();
    repository.listSubscriptionsDueForCharge.mockResolvedValue([
      unknown,
      valid,
    ]);
    repository.claimSubscriptionForCharge.mockResolvedValue(null);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 1,
      failed: 1,
    });
    expect(repository.claimSubscriptionForCharge).toHaveBeenCalledOnce();
    expect(repository.claimSubscriptionForCharge).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'subscription_valid' })
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[billing] renewal sweep item failed',
      expect.objectContaining({ subscriptionId: 'subscription_unknown' })
    );

    errorSpy.mockRestore();
  });
});

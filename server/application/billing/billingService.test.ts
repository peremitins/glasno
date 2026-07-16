import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingService } from './billingService';
import {
  createYooKassaPayment,
  createYooKassaPaymentMethodBinding,
  createYooKassaRecurringPayment,
  getYooKassaPayment,
  getYooKassaPaymentMethod,
} from './yookassaClient';
import {
  sendRenewalFailedEmail,
  sendRenewalNoticeEmail,
} from './renewalEmailSender';
import type {
  BillingRepository,
  PaidAccessRecord,
  PaymentOrderRecord,
} from '@/server/interface/billingRepository';

vi.mock('./yookassaClient', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./yookassaClient')>();
  return {
    ...actual,
    getYooKassaPayment: vi.fn(),
    getYooKassaPaymentMethod: vi.fn(),
    createYooKassaPayment: vi.fn(),
    createYooKassaPaymentMethodBinding: vi.fn(),
    createYooKassaRecurringPayment: vi.fn(),
  };
});

vi.mock('./renewalEmailSender', () => ({
  sendRenewalNoticeEmail: vi.fn().mockResolvedValue(true),
  sendRenewalFailedEmail: vi.fn().mockResolvedValue(true),
}));

const mockedGetYooKassaPayment = vi.mocked(getYooKassaPayment);
const mockedGetYooKassaPaymentMethod = vi.mocked(getYooKassaPaymentMethod);
const mockedCreateYooKassaPayment = vi.mocked(createYooKassaPayment);
const mockedCreateYooKassaPaymentMethodBinding = vi.mocked(
  createYooKassaPaymentMethodBinding
);
const mockedCreateYooKassaRecurringPayment = vi.mocked(
  createYooKassaRecurringPayment
);
const mockedSendRenewalNoticeEmail = vi.mocked(sendRenewalNoticeEmail);
const mockedSendRenewalFailedEmail = vi.mocked(sendRenewalFailedEmail);

function createOrder(
  overrides: Partial<PaymentOrderRecord> = {}
): PaymentOrderRecord {
  return {
    id: 'order_1',
    userId: 'user_1',
    planId: 'pass_30d',
    provider: 'yookassa',
    providerPaymentId: 'payment_1',
    status: 'pending',
    amountRub: 1190,
    currency: 'RUB',
    confirmationUrl: 'https://yookassa.test/payments/payment_1',
    metadata: { userId: 'user_1', planId: 'pass_30d', autoRenew: true },
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    ...overrides,
  };
}

function createAccess(
  overrides: Partial<PaidAccessRecord> = {}
): PaidAccessRecord {
  return {
    id: 'access_1',
    userId: 'user_1',
    planId: 'pass_30d',
    status: 'active',
    provider: 'yookassa',
    providerPaymentId: 'payment_1',
    currentPeriodEnd: new Date('2026-07-31T10:00:00.000Z'),
    autoRenew: true,
    nextChargeAt: new Date('2026-07-31T10:00:00.000Z'),
    lastChargeAttemptAt: null,
    lastChargeError: null,
    chargeAttempts: 0,
    renewalPlanId: 'pass_30d',
    renewalAmountRub: 1190,
    renewalNoticeSentAt: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    ...overrides,
  };
}

const activePaymentMethod = {
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
};

function createRepository(order = createOrder()) {
  let access: PaidAccessRecord | null = null;
  let fulfilledAt: Date | null = null;
  const repository = {
    countOwnerSessions: vi.fn().mockResolvedValue(1),
    countOwnerFreeSessionsUsed: vi.fn().mockResolvedValue(1),
    countOwnerSessionsSince: vi.fn().mockResolvedValue(0),
    findUserEmail: vi.fn().mockResolvedValue('user@example.com'),
    findAccessByUserId: vi.fn().mockImplementation(async () => access),
    setAccessAutoRenew: vi.fn().mockResolvedValue(undefined),
    listAccessDueForCharge: vi.fn().mockResolvedValue([]),
    claimAccessForCharge: vi.fn().mockResolvedValue(null),
    recordAccessChargeError: vi.fn().mockResolvedValue(undefined),
    listAccessDueForRenewalNotice: vi.fn().mockResolvedValue([]),
    claimRenewalNotice: vi.fn().mockResolvedValue(true),
    countRealtimeVoiceUsageSeconds: vi.fn().mockResolvedValue(0),
    getRealtimeMinuteBalance: vi.fn().mockResolvedValue({
      totalSeconds: 0,
      consumedSeconds: 0,
      remainingSeconds: 0,
    }),
    ensureTrialRealtimeGrant: vi.fn().mockResolvedValue(undefined),
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
    listPendingPaymentOrders: vi.fn().mockResolvedValue([]),
    claimGiftNotifications: vi.fn().mockResolvedValue([]),
    markGiftNotificationSent: vi.fn().mockResolvedValue(undefined),
    markGiftNotificationFailed: vi.fn().mockResolvedValue(undefined),
    findPaymentOrderById: vi.fn().mockResolvedValue(order),
    findPaymentOrderByProviderPaymentId: vi.fn().mockResolvedValue(order),
    findLatestPaymentOrderByUserId: vi.fn().mockResolvedValue(order),
    updatePaymentOrder: vi.fn().mockResolvedValue(order),
    findPaymentMethodByUserId: vi.fn().mockResolvedValue(null),
    savePendingPaymentMethod: vi.fn().mockResolvedValue(undefined),
    activatePaymentMethod: vi.fn().mockResolvedValue(undefined),
    deletePaymentMethodByUserId: vi.fn().mockResolvedValue(undefined),
    // Эмуляция идемпотентности продовой реализации: повторный вызов по тому
    // же заказу доступ не выдаёт; выдача создаёт/продлевает единственную
    // запись доступа пользователя.
    fulfillPaidOrder: vi.fn().mockImplementation(async (params) => {
      if (fulfilledAt) {
        return { fulfilled: false, alreadyFulfilled: true };
      }
      fulfilledAt = new Date();
      access = createAccess({
        planId: params.plan.id,
        providerPaymentId: params.providerPaymentId,
        autoRenew: params.autoRenew,
        renewalPlanId: params.plan.id,
        renewalAmountRub: params.plan.priceRub,
        currentPeriodEnd: new Date(
          Date.now() + params.plan.durationDays * 24 * 60 * 60 * 1000
        ),
      });
      return { fulfilled: true, alreadyFulfilled: false };
    }),
    // Хелпер для тестов: выставить запись доступа напрямую.
    __setAccess(value: PaidAccessRecord | null) {
      access = value;
    },
  } satisfies BillingRepository & {
    __setAccess: (value: PaidAccessRecord | null) => void;
  };

  return repository;
}

function createService(
  repository: ReturnType<typeof createRepository>,
  telegramAlerts?: {
    notifySubscriptionPurchased: ReturnType<typeof vi.fn>;
    notifyVoiceMinutesPurchased: ReturnType<typeof vi.fn>;
  }
) {
  return new BillingService({
    repository,
    config: {
      yookassa: { shopId: '123456', secretKey: 'test_secret' },
      appUrl: 'https://glasno.test',
    },
    telegramAlerts: telegramAlerts as never,
  });
}

describe('BillingService payment reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T10:00:00.000Z'));
  });

  it('reconciles a paid pass checkout and grants access when webhook did not update the order', async () => {
    const repository = createRepository();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
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
      hasActivePaidAccess: true,
      shouldContinuePolling: false,
      conversion: {
        planType: 'pass',
        amountRub: 1190,
      },
    });

    expect(repository.fulfillPaidOrder).toHaveBeenCalledWith({
      orderId: 'order_1',
      providerPaymentId: 'payment_1',
      plan: {
        id: 'pass_30d',
        type: 'pass',
        durationDays: 30,
        realtimeVoiceMinutes: 60,
        // Цена продления фиксируется по фактически оплаченной сумме заказа.
        priceRub: 1190,
      },
      autoRenew: true,
      paymentMethod: null,
    });
  });

  it('periodically reconciles pending payments without waiting for the user to return', async () => {
    const repository = createRepository();
    repository.listPendingPaymentOrders.mockResolvedValue([createOrder()]);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'canceled',
      paid: false,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await expect(service.runPendingPaymentSweep()).resolves.toEqual({
      checked: 1,
      reconciled: 1,
      failed: 0,
    });

    expect(repository.updatePaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order_1', status: 'canceled' })
    );
  });

  it('honours the declined auto-renew choice stored in order metadata', async () => {
    const order = createOrder({
      metadata: { userId: 'user_1', planId: 'pass_30d', autoRenew: false },
    });
    const repository = createRepository(order);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
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
      expect.objectContaining({ autoRenew: false })
    );
  });

  it('fixes the renewal price to the actually paid renewal amount', async () => {
    // Рекуррентный заказ по «старой» цене 999 ₽ при каталожной 1190 ₽.
    const order = createOrder({
      amountRub: 999,
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
      },
    });
    const repository = createRepository(order);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '999.00',
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
        plan: expect.objectContaining({ priceRub: 999 }),
      })
    );
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
      planId: 'pass_30d',
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
      amountValue: '1190.00',
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
      hasActivePaidAccess: false,
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
      amountValue: '1190.00',
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

  it('does not grant access twice for the same YooKassa payment', async () => {
    const repository = createRepository();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
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
      hasActivePaidAccess: true,
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
      hasActivePaidAccess: false,
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
      amountValue: '1190.00',
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

  it('does not grant access for a paid order that references an unknown plan', async () => {
    const order = createOrder({ planId: 'single_prep', amountRub: 399 });
    const repository = createRepository(order);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '399.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await service.reconcileYooKassaCheckout({
      userId: 'user_1',
      orderId: 'order_1',
    });

    expect(repository.fulfillPaidOrder).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[billing] paid order references unknown plan',
      expect.objectContaining({ planId: 'single_prep' })
    );
    errorSpy.mockRestore();
  });

  it('уведомляет Telegram о новой подписке при первой успешной оплате пропуска', async () => {
    const repository = createRepository();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const telegramAlerts = {
      notifySubscriptionPurchased: vi.fn().mockResolvedValue(undefined),
      notifyVoiceMinutesPurchased: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService(repository, telegramAlerts);

    await service.reconcileYooKassaCheckout({ userId: 'user_1', orderId: 'order_1' });

    expect(telegramAlerts.notifySubscriptionPurchased).toHaveBeenCalledTimes(1);
    expect(telegramAlerts.notifySubscriptionPurchased).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user_1', email: 'user@example.com' }),
      planName: 'Полный доступ · 30 дн.',
      amountRub: 1190,
      isRenewal: false,
    });
    expect(telegramAlerts.notifyVoiceMinutesPurchased).not.toHaveBeenCalled();
  });

  it('уведомляет Telegram о докупке минут при оплате пакета realtime_pack_30', async () => {
    const order = createOrder({
      planId: 'realtime_pack_30',
      amountRub: 490,
      metadata: { userId: 'user_1', planId: 'realtime_pack_30' },
    });
    const repository = createRepository(order);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '490.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const telegramAlerts = {
      notifySubscriptionPurchased: vi.fn().mockResolvedValue(undefined),
      notifyVoiceMinutesPurchased: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService(repository, telegramAlerts);

    const paymentStatus = await service.reconcileYooKassaCheckout({
      userId: 'user_1',
      orderId: 'order_1',
    });

    expect(telegramAlerts.notifyVoiceMinutesPurchased).toHaveBeenCalledTimes(1);
    expect(telegramAlerts.notifyVoiceMinutesPurchased).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user_1' }),
      planName: '+30 минут голоса',
      minutes: 30,
      amountRub: 490,
    });
    expect(telegramAlerts.notifySubscriptionPurchased).not.toHaveBeenCalled();
    expect(paymentStatus.conversion).toEqual({
      planType: 'minute_pack',
      amountRub: 490,
    });
  });

  it('не дублирует Telegram-алерт при повторном опросе уже выполненного заказа', async () => {
    const repository = createRepository();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const telegramAlerts = {
      notifySubscriptionPurchased: vi.fn().mockResolvedValue(undefined),
      notifyVoiceMinutesPurchased: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService(repository, telegramAlerts);

    await service.reconcileYooKassaCheckout({ userId: 'user_1', orderId: 'order_1' });
    await service.reconcileYooKassaCheckout({ userId: 'user_1', orderId: 'order_1' });

    expect(telegramAlerts.notifySubscriptionPurchased).toHaveBeenCalledTimes(1);
  });

  it('помечает автопродление отдельным типом алерта (isRenewal: true) по метке заказа', async () => {
    const order = createOrder({
      metadata: { userId: 'user_1', planId: 'pass_30d', renewal: true, autoRenew: true },
    });
    const repository = createRepository(order);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: null,
    });
    const telegramAlerts = {
      notifySubscriptionPurchased: vi.fn().mockResolvedValue(undefined),
      notifyVoiceMinutesPurchased: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService(repository, telegramAlerts);

    await service.reconcileYooKassaCheckout({ userId: 'user_1', orderId: 'order_1' });

    expect(telegramAlerts.notifySubscriptionPurchased).toHaveBeenCalledWith(
      expect.objectContaining({ isRenewal: true })
    );
  });
});

describe('BillingService payment history', () => {
  it('does not return unfinished checkout attempts as payment history', async () => {
    const repository = createRepository();
    repository.listPaymentOrdersByUserId.mockResolvedValue({
      items: [
        { order: createOrder({ status: 'pending' }), gift: null },
        {
          order: createOrder({ id: 'order_2', status: 'succeeded' }),
          gift: null,
        },
      ],
      nextCursor: null,
    });
    const service = createService(repository);

    await expect(
      service.getPaymentHistory({ userId: 'user_1', cursor: null, limit: 20 })
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: 'order_2', status: 'succeeded' }),
      ],
    });
  });

  it('maps plan and gift state and preserves the repository cursor', async () => {
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
            planId: 'pass_30d',
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
          planName: 'Полный доступ · 30 дн.',
          planType: 'pass',
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

  it('allows a trial user to buy a minute pack without an active pass', async () => {
    const repository = createRepository();
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ planId: 'realtime_pack_60', amountRub: 890 })
    );
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_trial_addon_1',
      status: 'pending',
      confirmation: {
        type: 'embedded',
        confirmation_token: 'ct_payment_trial_addon_1',
      },
    });
    const service = createService(repository);

    await expect(
      service.createCheckout({ userId: 'user_1', planId: 'realtime_pack_60' })
    ).resolves.toEqual({
      provider: 'yookassa',
      orderId: 'order_1',
      confirmationToken: 'ct_payment_trial_addon_1',
      returnUrl: 'https://glasno.test/pricing?payment=return&orderId=order_1',
    });
    expect(repository.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'realtime_pack_60',
        amountRub: 890,
        metadata: expect.objectContaining({ autoRenew: false }),
      })
    );
  });

  it('allows minute pack purchase with an active pass', async () => {
    const repository = createRepository();
    repository.__setAccess(
      createAccess({
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
    );
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ planId: 'realtime_pack_60', amountRub: 890 })
    );
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_addon_1',
      status: 'pending',
      confirmation: {
        type: 'embedded',
        confirmation_token: 'ct_payment_addon_1',
      },
    });
    const service = createService(repository);

    await expect(
      service.createCheckout({ userId: 'user_1', planId: 'realtime_pack_60' })
    ).resolves.toEqual({
      provider: 'yookassa',
      orderId: 'order_1',
      confirmationToken: 'ct_payment_addon_1',
      returnUrl: 'https://glasno.test/pricing?payment=return&orderId=order_1',
    });
    // Пакет минут — не автопродлеваемый: карту не сохраняем.
    expect(mockedCreateYooKassaPayment).toHaveBeenCalledWith(
      expect.objectContaining({ savePaymentMethod: false })
    );
  });

  it('allows an administrator to buy a minute pack without an active pass', async () => {
    const repository = createRepository();
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ planId: 'realtime_pack_60', amountRub: 890 })
    );
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_admin_addon_1',
      status: 'pending',
      confirmation: {
        type: 'embedded',
        confirmation_token: 'ct_payment_admin_addon_1',
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
      confirmationToken: 'ct_payment_admin_addon_1',
      returnUrl: 'https://glasno.test/pricing?payment=return&orderId=order_1',
    });
  });

  it('enables auto-renewal by default: saves the card and stores the choice in order metadata', async () => {
    const repository = createRepository();
    repository.createPaymentOrder.mockResolvedValue(createOrder());
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_pass_1',
      status: 'pending',
      confirmation: {
        type: 'embedded',
        confirmation_token: 'ct_payment_pass_1',
      },
    });
    const service = createService(repository);

    await service.createCheckout({ userId: 'user_1', planId: 'pass_30d' });

    expect(mockedCreateYooKassaPayment).toHaveBeenCalledWith(
      expect.objectContaining({ savePaymentMethod: true })
    );
    expect(repository.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { userId: 'user_1', planId: 'pass_30d', autoRenew: true },
      })
    );
  });

  it('respects the declined auto-renew checkbox: one-off purchase without card saving', async () => {
    const repository = createRepository();
    repository.createPaymentOrder.mockResolvedValue(createOrder());
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_pass_1',
      status: 'pending',
      confirmation: {
        type: 'embedded',
        confirmation_token: 'ct_payment_pass_1',
      },
    });
    const service = createService(repository);

    await service.createCheckout({
      userId: 'user_1',
      planId: 'pass_30d',
      autoRenew: false,
    });

    expect(mockedCreateYooKassaPayment).toHaveBeenCalledWith(
      expect.objectContaining({ savePaymentMethod: false })
    );
    expect(repository.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { userId: 'user_1', planId: 'pass_30d', autoRenew: false },
      })
    );
  });

  it('creates a gift checkout without auto-renewal and without leaking recipient email to YooKassa', async () => {
    const repository = createRepository();
    repository.createGiftPaymentOrder.mockResolvedValue({
      order: createOrder({ metadata: { gift: true } }),
      gift: {
        id: 'gift_1',
        orderId: 'order_1',
        purchaserUserId: 'user_1',
        recipientEmail: 'friend@example.com',
        senderName: 'Николай',
        planId: 'pass_30d',
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
        type: 'embedded',
        confirmation_token: 'ct_payment_gift_1',
      },
    });
    const service = createService(repository);

    await service.createCheckout({
      userId: 'user_1',
      planId: 'pass_30d',
      // Подарок принудительно без автопродления, даже если пришло true.
      autoRenew: true,
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
        description: 'Гласно Полный доступ · 30 дн., подарок',
        metadata: {
          orderId: 'order_1',
          userId: 'user_1',
          planId: 'pass_30d',
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

  it('rejects gifting a minute pack', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createCheckout({
        userId: 'user_1',
        planId: 'realtime_pack_60',
        gift: { recipientEmail: 'friend@example.com', senderName: 'Николай' },
      })
    ).rejects.toMatchObject({
      message: 'Подарить можно только пропуск «Полный доступ»',
    });
  });

  it('rejects gifting to the purchaser email', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.createCheckout({
        userId: 'user_1',
        planId: 'pass_30d',
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
        planId: 'pass_30d',
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
        planId: 'pass_30d',
        gift: { recipientEmail: 'friend@example.com', senderName: 'Николай' },
      })
    ).rejects.toThrow('network');
    expect(repository.cancelGiftOrder).toHaveBeenCalledWith({
      orderId: 'order_1',
    });
  });

  it('rejects checkout of removed legacy plans', async () => {
    const repository = createRepository();
    const service = createService(repository);

    for (const legacyId of ['single_prep', 'pro_monthly', 'free']) {
      await expect(
        service.createCheckout({ userId: 'user_1', planId: legacyId })
      ).rejects.toThrow('Тариф не найден');
    }
    expect(repository.createPaymentOrder).not.toHaveBeenCalled();
  });
});

describe('BillingService auto-renew management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('enables auto-renewal on the active pass after binding a card', async () => {
    const repository = createRepository();
    repository.__setAccess(
      createAccess({
        autoRenew: false,
        nextChargeAt: null,
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
    );
    repository.findPaymentMethodByUserId.mockResolvedValue({
      ...activePaymentMethod,
      status: 'pending',
    });
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
    expect(repository.setAccessAutoRenew).toHaveBeenCalledWith({
      userId: 'user_1',
      autoRenew: true,
    });
  });

  it('does not enable auto-renewal after binding when the pass has expired', async () => {
    const repository = createRepository();
    repository.__setAccess(
      createAccess({
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
        autoRenew: false,
        nextChargeAt: null,
      })
    );
    repository.findPaymentMethodByUserId.mockResolvedValue({
      ...activePaymentMethod,
      status: 'pending',
    });
    mockedGetYooKassaPaymentMethod.mockResolvedValue({
      id: 'pm_1',
      type: 'bank_card',
      saved: true,
      status: 'active',
      title: 'Bank card *1111',
      card: undefined,
    });
    const service = createService(repository);

    await service.syncPendingPaymentMethod('user_1');

    expect(repository.setAccessAutoRenew).not.toHaveBeenCalled();
  });

  it('requires a bound card and an active pass to enable auto-renewal', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.setAutoRenew({ userId: 'user_1', enabled: true })
    ).rejects.toThrow('привяжите карту');

    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    await expect(
      service.setAutoRenew({ userId: 'user_1', enabled: true })
    ).rejects.toThrow('Автопродление доступно при активном пропуске');
  });

  it('disables auto-renewal unconditionally (376-ФЗ) and on card unbind', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.setAutoRenew({ userId: 'user_1', enabled: false });
    expect(repository.setAccessAutoRenew).toHaveBeenCalledWith({
      userId: 'user_1',
      autoRenew: false,
    });

    await service.unbindPaymentMethod('user_1');
    expect(repository.deletePaymentMethodByUserId).toHaveBeenCalledWith(
      'user_1'
    );
    expect(repository.setAccessAutoRenew).toHaveBeenLastCalledWith({
      userId: 'user_1',
      autoRenew: false,
    });
  });
});

describe('BillingService payment-method binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an actionable error when YooKassa has not enabled recurring payments', async () => {
    const repository = createRepository();
    mockedCreateYooKassaPaymentMethodBinding.mockRejectedValue({
      statusCode: 403,
      data: {
        type: 'error',
        code: 'forbidden',
        description:
          "This store can't make recurring payments. Contact your YooMoney manager to learn more",
      },
    });
    const service = createService(repository);

    await expect(service.startPaymentMethodBinding('user_1')).rejects.toMatchObject({
      data: {
        code: 'E_FORBIDDEN',
        message: expect.stringContaining('Автопродление'),
      },
    });
    expect(repository.savePendingPaymentMethod).not.toHaveBeenCalled();
  });
});

describe('BillingService renewal sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T10:00:00.000Z'));
  });

  it('charges a due access with the fixed renewal price, not the catalog price', async () => {
    const due = createAccess({
      autoRenew: true,
      nextChargeAt: new Date('2026-07-31T09:00:00.000Z'),
      // Зафиксированная при покупке цена ниже каталожной.
      renewalAmountRub: 999,
    });
    const renewalOrder = createOrder({
      id: 'renewal_order_1',
      providerPaymentId: null,
      status: 'pending',
      amountRub: 999,
    });
    const repository = createRepository(renewalOrder);
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 1,
    });
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.createPaymentOrder.mockResolvedValue(renewalOrder);
    mockedCreateYooKassaRecurringPayment.mockResolvedValue({
      id: 'renewal_payment_1',
      status: 'succeeded',
    });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '999.00',
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

    expect(repository.listAccessDueForCharge).toHaveBeenCalledWith({
      now: new Date('2026-07-31T10:00:00.000Z'),
      retryAfterMs: 24 * 60 * 60 * 1000,
      maxAttempts: 3,
      limit: 25,
    });
    expect(repository.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amountRub: 999 })
    );
    expect(mockedCreateYooKassaRecurringPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountRub: 999 })
    );
    expect(repository.fulfillPaidOrder).toHaveBeenCalledOnce();
  });

  it('uses the due-access query for the opportunistic backup', async () => {
    const due = createAccess({
      autoRenew: true,
      nextChargeAt: new Date('2026-07-31T10:00:00.000Z'),
    });
    const repository = createRepository();
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue(null);
    const service = createService(repository);

    await service.maybeRunAutoRenewal('user_1');

    expect(repository.listAccessDueForCharge).toHaveBeenCalledWith({
      userId: 'user_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
      retryAfterMs: 24 * 60 * 60 * 1000,
      maxAttempts: 3,
      limit: 1,
    });
    expect(repository.claimAccessForCharge).toHaveBeenCalledWith({
      accessId: 'access_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
      retryAfterMs: 24 * 60 * 60 * 1000,
      maxAttempts: 3,
    });
  });

  it('disables auto-renewal when the card disappeared before the charge', async () => {
    const due = createAccess();
    const repository = createRepository();
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 1,
    });
    repository.findPaymentMethodByUserId.mockResolvedValue(null);
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.setAccessAutoRenew).toHaveBeenCalledWith({
      userId: 'user_1',
      autoRenew: false,
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
  });

  it('records a non-final charge failure without disabling auto-renewal', async () => {
    const due = createAccess();
    const repository = createRepository();
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 1,
    });
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ id: 'renewal_order_1' })
    );
    mockedCreateYooKassaRecurringPayment.mockRejectedValue(
      new Error('card declined')
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: 'card declined',
      disableAutoRenew: false,
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(mockedSendRenewalFailedEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('disables auto-renewal and emails the user after the final failed attempt', async () => {
    const due = createAccess();
    const repository = createRepository();
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    // Третья (финальная) попытка.
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 3,
    });
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ id: 'renewal_order_1' })
    );
    mockedCreateYooKassaRecurringPayment.mockResolvedValue({
      id: 'renewal_payment_1',
      status: 'canceled',
    });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_1',
      status: 'canceled',
      paid: false,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'renewal_order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: 'Списание отклонено (canceled)',
      disableAutoRenew: true,
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(mockedSendRenewalFailedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        planName: 'Полный доступ · 30 дн.',
        amountRub: 1190,
      })
    );
  });

  it('continues the sweep when one access throws', async () => {
    const first = createAccess({ id: 'access_1' });
    const second = createAccess({ id: 'access_2' });
    const repository = createRepository();
    repository.listAccessDueForCharge.mockResolvedValue([first, second]);
    repository.claimAccessForCharge
      .mockRejectedValueOnce(new Error('claim failed'))
      .mockResolvedValueOnce(null);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 1,
      failed: 1,
    });
    expect(repository.claimAccessForCharge).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      '[billing] renewal sweep item failed',
      expect.objectContaining({ accessId: 'access_1' })
    );

    errorSpy.mockRestore();
  });
});

describe('BillingService renewal notices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
  });

  it('sends an idempotent notice 3 days ahead for a 30-day pass', async () => {
    const access = createAccess({
      nextChargeAt: new Date('2026-07-31T10:00:00.000Z'),
    });
    const repository = createRepository();
    repository.listAccessDueForRenewalNotice.mockResolvedValue([access]);
    const service = createService(repository);

    await expect(service.runRenewalNoticeSweep()).resolves.toEqual({
      sent: 1,
      skipped: 0,
    });

    expect(repository.claimRenewalNotice).toHaveBeenCalledWith({
      accessId: 'access_1',
      now: new Date('2026-07-29T10:00:00.000Z'),
    });
    expect(mockedSendRenewalNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        planName: 'Полный доступ · 30 дн.',
        amountRub: 1190,
        chargeAt: new Date('2026-07-31T10:00:00.000Z'),
      })
    );
  });

  it('does not duplicate the notice when another sweep already claimed it', async () => {
    const access = createAccess({
      nextChargeAt: new Date('2026-07-31T10:00:00.000Z'),
    });
    const repository = createRepository();
    repository.listAccessDueForRenewalNotice.mockResolvedValue([access]);
    repository.claimRenewalNotice.mockResolvedValue(false);
    const service = createService(repository);

    await expect(service.runRenewalNoticeSweep()).resolves.toEqual({
      sent: 0,
      skipped: 1,
    });
    expect(mockedSendRenewalNoticeEmail).not.toHaveBeenCalled();
  });

  it('waits for the 1-day lead on short passes', async () => {
    const access = createAccess({
      planId: 'pass_7d',
      renewalPlanId: 'pass_7d',
      renewalAmountRub: 449,
      // Списание через 2 дня: для 7-дневного пропуска ещё рано (lead 1 день).
      nextChargeAt: new Date('2026-07-31T10:00:00.000Z'),
    });
    const repository = createRepository();
    repository.listAccessDueForRenewalNotice.mockResolvedValue([access]);
    const service = createService(repository);

    await expect(service.runRenewalNoticeSweep()).resolves.toEqual({
      sent: 0,
      skipped: 1,
    });
    expect(repository.claimRenewalNotice).not.toHaveBeenCalled();
  });

  it('claims but skips sending when the user has no email', async () => {
    const access = createAccess({
      nextChargeAt: new Date('2026-07-31T10:00:00.000Z'),
    });
    const repository = createRepository();
    repository.listAccessDueForRenewalNotice.mockResolvedValue([access]);
    repository.findUserEmail.mockResolvedValue(null);
    const service = createService(repository);

    await expect(service.runRenewalNoticeSweep()).resolves.toEqual({
      sent: 0,
      skipped: 1,
    });
    expect(repository.claimRenewalNotice).toHaveBeenCalledOnce();
    expect(mockedSendRenewalNoticeEmail).not.toHaveBeenCalled();
  });
});

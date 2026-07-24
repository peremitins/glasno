import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingService, resolveRenewalNoticeLeadMs } from './billingService';
import {
  createYooKassaPayment,
  createYooKassaPaymentMethodBinding,
  createYooKassaRecurringPayment,
  getYooKassaPayment,
  getYooKassaPaymentMethod,
  listYooKassaPayments,
} from './yookassaClient';
import {
  sendRenewalChargedEmail,
  sendRenewalFailedEmail,
  sendRenewalManualReviewEmail,
  sendRenewalNoticeEmail,
} from './renewalEmailSender';
import type {
  BillingRepository,
  PaidAccessRecord,
  PaymentOrderRecord,
} from '@/server/interface/billingRepository';
import {
  PassCheckoutInProgressError,
  RenewalPaymentQuarantinedError,
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
    listYooKassaPayments: vi.fn(),
  };
});

vi.mock('./renewalEmailSender', () => ({
  sendRenewalNoticeEmail: vi.fn().mockResolvedValue(true),
  sendRenewalFailedEmail: vi.fn().mockResolvedValue(true),
  sendRenewalManualReviewEmail: vi.fn().mockResolvedValue(true),
  sendRenewalChargedEmail: vi.fn().mockResolvedValue(true),
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
const mockedListYooKassaPayments = vi.mocked(listYooKassaPayments);
const mockedSendRenewalNoticeEmail = vi.mocked(sendRenewalNoticeEmail);
const mockedSendRenewalFailedEmail = vi.mocked(sendRenewalFailedEmail);
const mockedSendRenewalManualReviewEmail = vi.mocked(
  sendRenewalManualReviewEmail
);
const mockedSendRenewalChargedEmail = vi.mocked(sendRenewalChargedEmail);

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
    findOwnerUnfinishedSession: vi.fn().mockResolvedValue(null),
    countOwnerSessionsSince: vi.fn().mockResolvedValue(0),
    countTrialSessionsByIpHashSince: vi.fn().mockResolvedValue(0),
    clearCreatorIpHashesOlderThan: vi.fn().mockResolvedValue(0),
    findUserEmail: vi.fn().mockResolvedValue('user@example.com'),
    findAccessByUserId: vi.fn().mockImplementation(async () => access),
    setAccessAutoRenew: vi.fn().mockResolvedValue(true),
    listAccessDueForCharge: vi.fn().mockResolvedValue([]),
    claimAccessForCharge: vi.fn().mockResolvedValue(null),
    recordAccessChargeError: vi.fn().mockResolvedValue(true),
    rescheduleAccessChargeVerification: vi.fn().mockResolvedValue(true),
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
    claimPaymentOrderReconciliation: vi.fn().mockResolvedValue(true),
    findUnfulfilledRenewalPaymentOrder: vi.fn().mockResolvedValue(null),
    markRenewalFailureHandled: vi.fn().mockResolvedValue(true),
    claimRenewalSuccessNotification: vi.fn().mockResolvedValue(true),
    claimGiftNotifications: vi.fn().mockResolvedValue([]),
    markGiftNotificationSent: vi.fn().mockResolvedValue(undefined),
    markGiftNotificationFailed: vi.fn().mockResolvedValue(undefined),
    findPaymentOrderById: vi.fn().mockResolvedValue(order),
    findPaymentOrderByProviderPaymentId: vi.fn().mockResolvedValue(order),
    bindPaymentOrderProviderPaymentId: vi.fn().mockResolvedValue(true),
    findLatestPaymentOrderByUserId: vi.fn().mockResolvedValue(order),
    updatePaymentOrder: vi.fn().mockResolvedValue(order),
    findPaymentMethodByUserId: vi.fn().mockResolvedValue(null),
    findPaymentMethodByProviderPaymentMethodId: vi
      .fn()
      .mockResolvedValue(null),
    savePendingPaymentMethod: vi.fn().mockResolvedValue(undefined),
    activatePaymentMethod: vi.fn().mockResolvedValue(true),
    deletePaymentMethodByUserId: vi.fn().mockResolvedValue(undefined),
    deletePaymentMethodIfMatches: vi.fn().mockResolvedValue(true),
    revokeRecurringPaymentConsent: vi.fn().mockResolvedValue(undefined),
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
    notifyPaymentIssue?: ReturnType<typeof vi.fn>;
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

  it('does not reconcile an order already leased by another worker', async () => {
    const repository = createRepository();
    repository.listPendingPaymentOrders.mockResolvedValue([createOrder()]);
    repository.claimPaymentOrderReconciliation.mockResolvedValue(false);
    const service = createService(repository);

    await expect(service.runPendingPaymentSweep()).resolves.toEqual({
      checked: 1,
      reconciled: 0,
      failed: 0,
    });

    expect(mockedGetYooKassaPayment).not.toHaveBeenCalled();
  });

  it('finalizes an asynchronously canceled renewal in the pending sweep', async () => {
    const order = createOrder({
      id: 'renewal_async_canceled',
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
        renewalAttemptNumber: 1,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(createAccess({ chargeAttempts: 0 }));
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'canceled',
      paid: false,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: order.id },
      paymentMethod: null,
      cancellationParty: 'payment_network',
      cancellationReason: 'insufficient_funds',
    });
    const service = createService(repository);

    await service.runPendingPaymentSweep();

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('insufficient_funds'),
      disableAutoRenew: false,
      deferRetryUntilPeriodEnd: true,
      retryAt: new Date('2026-07-02T10:00:00.000Z'),
      restoreChargeAttemptsTo: 1,
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
    expect(repository.markRenewalFailureHandled).toHaveBeenCalledWith({
      orderId: order.id,
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
  });

  it('sends one confirmation when a pending renewal succeeds asynchronously', async () => {
    const order = createOrder({
      id: 'renewal_async_succeeded',
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
        renewalAttemptNumber: 1,
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(createAccess());
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    repository.claimRenewalSuccessNotification
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: order.id },
      paymentMethod: null,
    });
    const service = createService(repository);

    await service.runPendingPaymentSweep();
    await service.runPendingPaymentSweep();

    expect(repository.claimRenewalSuccessNotification).toHaveBeenCalledTimes(2);
    expect(mockedSendRenewalChargedEmail).toHaveBeenCalledOnce();
  });

  it('recovers a third-attempt order after a crash before provider id was saved', async () => {
    const order = createOrder({
      id: 'renewal_crash_before_provider_id',
      providerPaymentId: null,
      status: 'pending',
      createdAt: new Date('2026-07-01T09:55:00.000Z'),
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
        renewalAttemptNumber: 3,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(createAccess({ chargeAttempts: 3 }));
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    mockedCreateYooKassaRecurringPayment.mockResolvedValue({
      id: 'renewal_payment_recovered',
      status: 'succeeded',
    });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_recovered',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: order.id },
      paymentMethod: null,
    });
    const service = createService(repository);

    await expect(service.runPendingPaymentSweep()).resolves.toEqual({
      checked: 1,
      reconciled: 1,
      failed: 0,
    });

    expect(mockedCreateYooKassaRecurringPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotenceKey: order.id,
        paymentMethodId: 'pm_1',
      })
    );
    expect(repository.fulfillPaidOrder).toHaveBeenCalledOnce();
  });

  it('does not create a recovered renewal payment while the kill-switch is active', async () => {
    const order = createOrder({
      id: 'renewal_disabled_recovery',
      providerPaymentId: null,
      status: 'pending',
      createdAt: new Date('2026-07-01T09:55:00.000Z'),
      metadata: {
        renewal: true,
        accessId: 'access_1',
        renewalAttemptNumber: 1,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(createAccess());
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    const service = createService(repository);

    await service.runPendingPaymentSweep({ allowRenewalCreate: false });

    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
    expect(repository.updatePaymentOrder).toHaveBeenCalledWith({
      id: order.id,
      onlyIfUnfulfilled: true,
      metadata: {
        renewalRetryAt: '2026-07-01T11:00:00.000Z',
      },
      mergeMetadata: true,
    });
    expect(repository.recordAccessChargeError).not.toHaveBeenCalled();
  });

  it('never starts a recovered charge after the user revoked consent', async () => {
    const order = createOrder({
      id: 'renewal_revoked_before_recovery',
      providerPaymentId: null,
      status: 'pending',
      createdAt: new Date('2026-07-01T09:55:00.000Z'),
      metadata: {
        renewal: true,
        accessId: 'access_1',
        renewalAttemptNumber: 1,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(
      createAccess({ autoRenew: false, nextChargeAt: null })
    );
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    const service = createService(repository);

    await service.runPendingPaymentSweep();

    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
    expect(repository.updatePaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: order.id,
        status: 'indeterminate',
      })
    );
    expect(repository.markRenewalFailureHandled).toHaveBeenCalledWith({
      orderId: order.id,
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
    expect(repository.recordAccessChargeError).not.toHaveBeenCalled();
  });

  it('does not apply an old renewal failure to a newer purchase generation', async () => {
    const order = createOrder({
      id: 'renewal_old_generation',
      providerPaymentId: 'renewal_payment_old',
      status: 'pending',
      metadata: {
        renewal: true,
        accessId: 'access_1',
        renewalAttemptNumber: 3,
        renewalAccessProviderPaymentId: 'payment_old_generation',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_old',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(
      createAccess({ providerPaymentId: 'payment_new_generation' })
    );
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_old',
      status: 'canceled',
      paid: false,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: order.id },
      paymentMethod: null,
      cancellationParty: 'payment_network',
      cancellationReason: 'permission_revoked',
    });
    const service = createService(repository);

    await service.runPendingPaymentSweep();

    expect(repository.markRenewalFailureHandled).toHaveBeenCalledWith({
      orderId: order.id,
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
    expect(repository.recordAccessChargeError).not.toHaveBeenCalled();
    expect(repository.deletePaymentMethodIfMatches).not.toHaveBeenCalled();
    expect(mockedSendRenewalFailedEmail).not.toHaveBeenCalled();
  });

  it('does not let a late old-method failure disable a newly bound method', async () => {
    const order = createOrder({
      id: 'renewal_old_method',
      providerPaymentId: 'renewal_payment_old_method',
      status: 'pending',
      metadata: {
        renewal: true,
        accessId: 'access_1',
        renewalAttemptNumber: 3,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_old',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(createAccess({ chargeAttempts: 0 }));
    repository.findPaymentMethodByUserId.mockResolvedValue({
      ...activePaymentMethod,
      providerPaymentMethodId: 'pm_new',
    });
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_old_method',
      status: 'canceled',
      paid: false,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: order.id },
      paymentMethod: null,
      cancellationParty: 'payment_network',
      cancellationReason: 'insufficient_funds',
    });
    const service = createService(repository);

    await service.runPendingPaymentSweep();

    expect(repository.markRenewalFailureHandled).toHaveBeenCalledWith({
      orderId: order.id,
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
    expect(repository.recordAccessChargeError).not.toHaveBeenCalled();
    expect(repository.deletePaymentMethodIfMatches).not.toHaveBeenCalled();
    expect(mockedSendRenewalFailedEmail).not.toHaveBeenCalled();
  });

  it('clears a handled quarantine after a late verified cancellation', async () => {
    const order = createOrder({
      id: 'renewal_quarantine_late_canceled',
      providerPaymentId: 'renewal_payment_late_canceled',
      status: 'indeterminate',
      metadata: {
        renewal: true,
        accessId: 'access_1',
        renewalFailureHandled: true,
        renewalQuarantined: true,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_late_canceled',
      status: 'canceled',
      paid: false,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: order.id },
      paymentMethod: null,
      cancellationParty: 'payment_network',
      cancellationReason: 'insufficient_funds',
    });
    const service = createService(repository);

    await service.runPendingPaymentSweep();

    expect(repository.updatePaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: order.id,
        providerPaymentId: 'renewal_payment_late_canceled',
        status: 'canceled',
        onlyIfUnfulfilled: true,
        metadata: expect.objectContaining({
          renewalQuarantined: false,
          renewalRetryAt: null,
        }),
      })
    );
    expect(repository.recordAccessChargeError).not.toHaveBeenCalled();
  });

  it('resolves a quarantined renewal by locating the lost payment in YooKassa', async () => {
    // Упавший POST: заказ в карантине без providerPaymentId, согласие уже
    // отозвано. Поиск по metadata.orderId находит реальный успешный платёж —
    // пользователь получает оплаченный доступ, карантин снимается.
    const order = createOrder({
      id: 'renewal_quarantined_lost_payment',
      providerPaymentId: null,
      status: 'indeterminate',
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
        renewalQuarantined: true,
        renewalFailureHandled: true,
        renewalAttemptNumber: 1,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(
      createAccess({ autoRenew: false, nextChargeAt: null })
    );
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    mockedListYooKassaPayments.mockResolvedValue({
      items: [
        {
          id: 'payment_lost',
          status: 'succeeded',
          paid: true,
          amountValue: '1190.00',
          currency: 'RUB',
          metadata: {
            orderId: order.id,
            userId: 'user_1',
            planId: 'pass_30d',
          },
          paymentMethod: null,
        },
      ],
      nextCursor: null,
    });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_lost',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: order.id, userId: 'user_1', planId: 'pass_30d' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await expect(service.runPendingPaymentSweep()).resolves.toEqual({
      checked: 1,
      reconciled: 1,
      failed: 0,
    });

    expect(repository.bindPaymentOrderProviderPaymentId).toHaveBeenCalledWith({
      orderId: order.id,
      providerPaymentId: 'payment_lost',
    });
    expect(repository.fulfillPaidOrder).toHaveBeenCalledOnce();
    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
    expect(mockedSendRenewalManualReviewEmail).not.toHaveBeenCalled();
  });

  it('unblocks a revoked-consent renewal when YooKassa proves no payment exists', async () => {
    // Сценарий пользователя: списание сорвалось без id, потом он отвязал
    // способ и выключил автопродление. Доказанное отсутствие платежа
    // закрывает заказ без карантина, поддержки и блокировки новой покупки.
    const order = createOrder({
      id: 'renewal_absent_after_revocation',
      providerPaymentId: null,
      status: 'pending',
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
      metadata: {
        renewal: true,
        accessId: 'access_1',
        renewalAttemptNumber: 1,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(
      createAccess({ autoRenew: false, nextChargeAt: null })
    );
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    mockedListYooKassaPayments.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const service = createService(repository);

    await service.runPendingPaymentSweep();

    expect(repository.updatePaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: order.id,
        status: 'canceled',
        onlyIfUnfulfilled: true,
        metadata: expect.objectContaining({
          renewalErrorKind: 'not_attempted',
          renewalQuarantined: false,
        }),
      })
    );
    expect(repository.markRenewalFailureHandled).toHaveBeenCalledWith({
      orderId: order.id,
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
    expect(mockedSendRenewalManualReviewEmail).not.toHaveBeenCalled();
    expect(repository.recordAccessChargeError).not.toHaveBeenCalled();
    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
  });

  it('schedules a fresh charge after proving an expired-key renewal never started', async () => {
    // Согласие в силе, но same-key окно истекло. Отсутствие платежа доказано —
    // новая попытка с новым заказом безопасна и назначается сразу.
    const order = createOrder({
      id: 'renewal_absent_expired_key',
      providerPaymentId: null,
      status: 'pending',
      createdAt: new Date('2026-06-30T09:00:00.000Z'),
      metadata: {
        renewal: true,
        accessId: 'access_1',
        renewalAttemptNumber: 1,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(createAccess({ chargeAttempts: 1 }));
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    mockedListYooKassaPayments.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const service = createService(repository);

    await service.runPendingPaymentSweep();

    expect(repository.updatePaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: order.id,
        status: 'canceled',
        metadata: expect.objectContaining({
          renewalErrorKind: 'not_attempted',
        }),
      })
    );
    expect(repository.rescheduleAccessChargeVerification).toHaveBeenCalledWith({
      accessId: 'access_1',
      chargeAttempts: 0,
      retryAt: new Date('2026-07-01T10:00:00.000Z'),
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
    expect(mockedSendRenewalManualReviewEmail).not.toHaveBeenCalled();
  });

  it('auto-resolves a legacy indeterminate renewal without the quarantined flag', async () => {
    // Прод-инцидент 2026-07-22: промежуточная версия кода оставила заказ в
    // status='indeterminate' без renewalQuarantined. Такой заказ блокировал
    // покупку, но не попадал в очередь sweep. Инвариант: всё блокирующее
    // без provider id обязано авторазрешаться поиском платежа.
    const order = createOrder({
      id: 'renewal_indeterminate_without_flag',
      providerPaymentId: null,
      status: 'indeterminate',
      createdAt: new Date('2026-06-30T10:00:00.000Z'),
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
        renewalFailureHandled: true,
        renewalErrorDiagnostic:
          'Автосписание не возобновлено: согласие или сохранённый способ оплаты уже изменились',
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(
      createAccess({ autoRenew: false, nextChargeAt: null })
    );
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    mockedListYooKassaPayments.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const service = createService(repository);

    await service.runPendingPaymentSweep();

    expect(repository.updatePaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: order.id,
        status: 'canceled',
        onlyIfUnfulfilled: true,
        metadata: expect.objectContaining({
          renewalErrorKind: 'not_attempted',
          renewalQuarantined: false,
        }),
      })
    );
    expect(mockedSendRenewalManualReviewEmail).not.toHaveBeenCalled();
    expect(repository.recordAccessChargeError).not.toHaveBeenCalled();
    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
  });

  it('keeps the quarantine with backoff when the payment search is unavailable', async () => {
    // Повторный проход уже обработанного карантина: только продление backoff,
    // без новых писем, алертов и записей об ошибке списания.
    const order = createOrder({
      id: 'renewal_quarantine_search_failed',
      providerPaymentId: null,
      status: 'indeterminate',
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
      metadata: {
        renewal: true,
        accessId: 'access_1',
        renewalQuarantined: true,
        renewalFailureHandled: true,
        renewalErrorDiagnostic: 'Исход автосписания неизвестен',
        renewalAttemptNumber: 1,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(createAccess());
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    mockedListYooKassaPayments.mockRejectedValue(new Error('network down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await service.runPendingPaymentSweep();
    errorSpy.mockRestore();

    expect(repository.updatePaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: order.id,
        status: 'indeterminate',
        metadata: expect.objectContaining({
          renewalQuarantined: true,
          renewalRetryAt: expect.any(String),
        }),
      })
    );
    expect(repository.recordAccessChargeError).not.toHaveBeenCalled();
    expect(mockedSendRenewalManualReviewEmail).not.toHaveBeenCalled();
    expect(repository.markRenewalFailureHandled).not.toHaveBeenCalled();
  });

  it('fails closed for a legacy failed order with an unknown POST outcome', async () => {
    const order = createOrder({
      id: 'legacy_unknown_post',
      providerPaymentId: null,
      status: 'failed',
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      metadata: {
        renewal: true,
        accessId: 'access_1',
        renewalAttemptNumber: 3,
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(createAccess({ chargeAttempts: 3 }));
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    const service = createService(repository);

    await service.runPendingPaymentSweep();

    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: 'Списание отклонено (failed)',
      disableAutoRenew: true,
      restoreChargeAttemptsTo: 3,
      expectedProviderPaymentId: 'payment_1',
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
    expect(repository.markRenewalFailureHandled).toHaveBeenCalledWith({
      orderId: order.id,
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
  });

  it('also fails closed for a legacy pending order without a request snapshot', async () => {
    const order = createOrder({
      id: 'legacy_pending_unknown_post',
      providerPaymentId: null,
      status: 'pending',
      metadata: {
        renewal: true,
        accessId: 'access_1',
      },
    });
    const repository = createRepository(order);
    repository.__setAccess(
      createAccess({
        chargeAttempts: 2,
        updatedAt: new Date('2026-07-02T10:00:00.000Z'),
      })
    );
    repository.listPendingPaymentOrders.mockResolvedValue([order]);
    const service = createService(repository);

    await service.runPendingPaymentSweep();

    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('согласие или сохранённый способ'),
      disableAutoRenew: true,
      restoreChargeAttemptsTo: 2,
      expectedProviderPaymentId: 'payment_1',
      now: new Date('2026-07-01T10:00:00.000Z'),
    });
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

  it('uses verified payment metadata instead of an untrusted webhook order id', async () => {
    const paidOrder = createOrder({
      id: 'order_paid',
      providerPaymentId: 'payment_paid',
    });
    const attackerSelectedOrder = createOrder({
      id: 'order_attacker_selected',
      providerPaymentId: null,
    });
    const repository = createRepository(paidOrder);
    repository.findPaymentOrderById.mockImplementation(async (orderId) => {
      if (orderId === paidOrder.id) return paidOrder;
      if (orderId === attackerSelectedOrder.id) return attackerSelectedOrder;
      return null;
    });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_paid',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: {
        orderId: 'order_paid',
        userId: 'user_1',
        planId: 'pass_30d',
      },
      paymentMethod: null,
    });
    const service = createService(repository);

    await service.handleYooKassaWebhook({
      event: 'payment.succeeded',
      object: {
        id: 'payment_paid',
        status: 'succeeded',
        paid: true,
        metadata: { orderId: 'order_attacker_selected' },
      },
    });

    expect(repository.findPaymentOrderById).toHaveBeenCalledWith('order_paid');
    expect(repository.findPaymentOrderById).toHaveBeenCalledWith(
      'order_attacker_selected'
    );
    expect(repository.fulfillPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order_paid' })
    );
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

  it('builds the return url from a safe internal returnPath', async () => {
    const repository = createRepository();
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ planId: 'realtime_pack_60', amountRub: 890 })
    );
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_return_path_1',
      status: 'pending',
      confirmation: {
        type: 'embedded',
        confirmation_token: 'ct_payment_return_path_1',
      },
    });
    const service = createService(repository);

    await expect(
      service.createCheckout({
        userId: 'user_1',
        planId: 'realtime_pack_60',
        returnPath: '/interview/sess-uuid-1',
      })
    ).resolves.toEqual(
      expect.objectContaining({
        returnUrl:
          'https://glasno.test/interview/sess-uuid-1?payment=return&orderId=order_1',
      })
    );
  });

  it('sends a payment issue alert when YooKassa rejects payment creation', async () => {
    const repository = createRepository();
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ planId: 'realtime_pack_60', amountRub: 890 })
    );
    mockedCreateYooKassaPayment.mockRejectedValue({
      data: { description: 'Internal error' },
    });
    const telegramAlerts = {
      notifySubscriptionPurchased: vi.fn().mockResolvedValue(undefined),
      notifyVoiceMinutesPurchased: vi.fn().mockResolvedValue(undefined),
      notifyPaymentIssue: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService(repository, telegramAlerts);

    await expect(
      service.createCheckout({ userId: 'user_1', planId: 'realtime_pack_60' })
    ).rejects.toMatchObject({ data: { code: 'E_UPSTREAM' } });

    expect(telegramAlerts.notifyPaymentIssue).toHaveBeenCalledTimes(1);
    expect(telegramAlerts.notifyPaymentIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'checkout_create_failed',
        orderId: 'order_1',
        planId: 'realtime_pack_60',
        user: expect.objectContaining({ id: 'user_1' }),
      })
    );
  });

  it('sends a widget failure alert reported by the client, hiding foreign orders', async () => {
    const repository = createRepository();
    repository.findPaymentOrderById.mockResolvedValue(
      createOrder({ planId: 'realtime_pack_30', amountRub: 490 })
    );
    const telegramAlerts = {
      notifySubscriptionPurchased: vi.fn().mockResolvedValue(undefined),
      notifyVoiceMinutesPurchased: vi.fn().mockResolvedValue(undefined),
      notifyPaymentIssue: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService(repository, telegramAlerts);

    await service.reportCheckoutIssue({ userId: 'user_1', orderId: 'order_1' });
    expect(telegramAlerts.notifyPaymentIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'widget_load_failed',
        orderId: 'order_1',
        planId: 'realtime_pack_30',
      })
    );

    // Чужой заказ: алерт уходит, но без деталей заказа.
    await service.reportCheckoutIssue({
      userId: 'user_2',
      orderId: 'order_1',
    });
    expect(telegramAlerts.notifyPaymentIssue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stage: 'widget_load_failed',
        orderId: null,
        planId: null,
        user: expect.objectContaining({ id: 'user_2' }),
      })
    );
  });

  it('falls back to /pricing when returnPath could leave our origin', async () => {
    const repository = createRepository();
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ planId: 'realtime_pack_60', amountRub: 890 })
    );
    mockedCreateYooKassaPayment.mockResolvedValue({
      id: 'payment_return_path_2',
      status: 'pending',
      confirmation: {
        type: 'embedded',
        confirmation_token: 'ct_payment_return_path_2',
      },
    });
    const service = createService(repository);

    await expect(
      service.createCheckout({
        userId: 'user_1',
        planId: 'realtime_pack_60',
        returnPath: '//evil.com',
      })
    ).resolves.toEqual(
      expect.objectContaining({
        returnUrl: 'https://glasno.test/pricing?payment=return&orderId=order_1',
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

  it('blocks a second pass checkout while a renewal outcome is unresolved', async () => {
    const repository = createRepository();
    repository.createPaymentOrder.mockRejectedValue(
      new RenewalPaymentQuarantinedError()
    );
    const service = createService(repository);

    await expect(
      service.createCheckout({ userId: 'user_1', planId: 'pass_30d' })
    ).rejects.toMatchObject({
      data: {
        code: 'E_CONFLICT',
        message: expect.stringContaining('избежать повторного списания'),
      },
    });
    expect(mockedCreateYooKassaPayment).not.toHaveBeenCalled();
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

describe('BillingService invalid payment method handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T10:00:00.000Z'));
  });

  it('reports the failure loudly after deleting the invalid payment method', async () => {
    // Прод-инцидент 23.07: удалив негодный способ, обработчик спотыкался о
    // собственный guard «тот ли способ ещё привязан» и выходил раньше времени.
    // Автопродление оставалось включённым, ошибка не записывалась, письма и
    // алерта не было — пользователь видел противоречивый экран.
    const due = createAccess({ chargeAttempts: 0 });
    const renewalOrder = createOrder({
      id: 'renewal_invalid_method',
      providerPaymentId: null,
      status: 'pending',
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
    repository.deletePaymentMethodIfMatches.mockResolvedValue(true);
    mockedCreateYooKassaRecurringPayment.mockRejectedValue({
      statusCode: 400,
      data: {
        code: 'invalid_request',
        parameter: 'payment_method_id',
        description: "This payment_method_id doesn't exist",
      },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await service.runAutoRenewalSweep();
    errorSpy.mockRestore();

    expect(repository.deletePaymentMethodIfMatches).toHaveBeenCalledWith({
      userId: 'user_1',
      providerPaymentMethodId: 'pm_1',
    });
    // Главное: отказ доведён до конца, а не проглочен.
    expect(repository.recordAccessChargeError).toHaveBeenCalledWith(
      expect.objectContaining({
        accessId: 'access_1',
        disableAutoRenew: true,
        requireNoActivePaymentMethod: true,
        error: expect.stringContaining('payment_method_id'),
      })
    );
    expect(mockedSendRenewalFailedEmail).toHaveBeenCalledOnce();
  });
});

describe('BillingService saved payment method verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T10:00:00.000Z'));
  });

  it('does not save a payment method the payer chose not to save', async () => {
    // saved=false — плательщик не согласился сохранить способ (или банк не
    // поддерживает автоплатежи). Автопродление на такой способ не заводим.
    const repository = createRepository();
    mockedGetYooKassaPaymentMethod.mockReset();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: {
        id: 'pm_1',
        saved: false,
        methodType: 'bank_card',
        title: 'Bank card *1111',
        cardBrand: 'Visa',
        cardLast4: '1111',
        cardExpiryMonth: '12',
        cardExpiryYear: '30',
      },
    });
    const service = createService(repository);

    await service.reconcileYooKassaCheckout({
      userId: 'user_1',
      orderId: 'order_1',
    });

    expect(repository.fulfillPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: null })
    );
  });

  it('stores an SBP method saved during payment, like a card', async () => {
    // Прод-факт (24.07): по СБП с save_payment_method YooKassa возвращает в
    // платеже saved=true и НЕ шлёт отдельного payment_method.active — токен
    // отдаётся прямо в платеже, как у карты. Признак пригодности — saved=true;
    // methodType роли не играет. GET к токену «из платежа» неприменим.
    const repository = createRepository();
    mockedGetYooKassaPaymentMethod.mockReset();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: {
        id: 'payment_1',
        saved: true,
        methodType: 'sbp',
        title: null,
        cardBrand: null,
        cardLast4: null,
        cardExpiryMonth: null,
        cardExpiryYear: null,
      },
    });
    const service = createService(repository);

    await service.reconcileYooKassaCheckout({
      userId: 'user_1',
      orderId: 'order_1',
    });

    expect(repository.fulfillPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: expect.objectContaining({
          providerPaymentMethodId: 'payment_1',
          methodType: 'sbp',
          status: 'active',
        }),
      })
    );
    // Пригодность способа не должна зависеть от отдельного запроса к провайдеру.
    expect(mockedGetYooKassaPaymentMethod).not.toHaveBeenCalled();
  });

  it('stores a card saved during payment even when its id equals the payment id', async () => {
    // У первого платежа YooKassa возвращает payment_method.id, РАВНЫЙ id
    // платежа — и для карты тоже (док «Виджет: сохранение способов»). Признак
    // пригодности — saved=true и тип не sbp, а не различие id. Отдельный GET
    // (ресурс только для привязок на нулевую сумму) не нужен и не должен
    // блокировать автопродление.
    const repository = createRepository();
    mockedGetYooKassaPaymentMethod.mockReset();
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
      paymentMethod: {
        id: 'payment_1',
        saved: true,
        methodType: 'bank_card',
        title: 'Bank card *1111',
        cardBrand: 'Visa',
        cardLast4: '1111',
        cardExpiryMonth: '12',
        cardExpiryYear: '30',
      },
    });
    const service = createService(repository);

    await service.reconcileYooKassaCheckout({
      userId: 'user_1',
      orderId: 'order_1',
    });

    expect(repository.fulfillPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: expect.objectContaining({
          providerPaymentMethodId: 'payment_1',
          status: 'active',
        }),
      })
    );
    expect(mockedGetYooKassaPaymentMethod).not.toHaveBeenCalled();
  });

  it('drops a phantom pending method only after the grace window', async () => {
    const repository = createRepository();
    repository.findPaymentMethodByUserId.mockResolvedValue({
      ...activePaymentMethod,
      status: 'pending',
      providerPaymentMethodId: 'phantom_1',
      createdAt: new Date('2026-07-01T09:00:00.000Z'),
    });
    mockedGetYooKassaPaymentMethod.mockRejectedValue({
      statusCode: 404,
      data: { code: 'not_found' },
    });
    const service = createService(repository);

    await service.syncPendingPaymentMethod('user_1');

    expect(repository.deletePaymentMethodIfMatches).not.toHaveBeenCalled();

    repository.findPaymentMethodByUserId.mockResolvedValue({
      ...activePaymentMethod,
      status: 'pending',
      providerPaymentMethodId: 'phantom_1',
      createdAt: new Date('2026-06-29T09:00:00.000Z'),
    });

    await service.syncPendingPaymentMethod('user_1');

    expect(repository.deletePaymentMethodIfMatches).toHaveBeenCalledWith({
      userId: 'user_1',
      providerPaymentMethodId: 'phantom_1',
    });
  });

  it('names the unavailable method when the shop refuses an SBP binding', async () => {
    // Тестовый магазин YooKassa не умеет СБП и отвечает 403. Сообщение должно
    // называть недоступным именно способ, а не автопродление целиком.
    const repository = createRepository();
    mockedCreateYooKassaPaymentMethodBinding.mockRejectedValue({
      statusCode: 403,
      data: {
        code: 'forbidden',
        description: "This store can't make recurring payments",
      },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await expect(
      service.startPaymentMethodBinding('user_1', 'sbp')
    ).rejects.toThrow('СБП');
    errorSpy.mockRestore();

    expect(repository.savePendingPaymentMethod).not.toHaveBeenCalled();
  });

  it('binds an SBP account through the zero-amount binding flow', async () => {
    const repository = createRepository();
    mockedCreateYooKassaPaymentMethodBinding.mockResolvedValue({
      id: 'sbp_binding_1',
      type: 'sbp',
      saved: false,
      status: 'pending',
      confirmation: {
        type: 'qr',
        confirmation_data: 'https://sub.nspk.ru/AAA111',
      },
    });
    const service = createService(repository);

    await expect(
      service.startPaymentMethodBinding('user_1', 'sbp')
    ).resolves.toEqual({
      methodType: 'sbp',
      confirmationUrl: 'https://sub.nspk.ru/AAA111',
    });

    expect(mockedCreateYooKassaPaymentMethodBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        methodType: 'sbp',
        // userId в metadata — устойчивый ключ корреляции payment_method.active.
        metadata: { userId: 'user_1' },
      })
    );
    expect(repository.savePendingPaymentMethod).toHaveBeenCalledWith({
      userId: 'user_1',
      providerPaymentMethodId: 'sbp_binding_1',
      methodType: 'sbp',
    });
  });

  it('activates a pending SBP binding on a payment_method.active webhook', async () => {
    // Привязка счёта СБП подтверждается асинхронно: банк сообщает YooKassa,
    // а та шлёт payment_method.active. По этому событию активируем pending без
    // ожидания, пока пользователь снова откроет страницу профиля.
    const repository = createRepository();
    repository.findPaymentOrderById.mockResolvedValue(null);
    repository.findPaymentOrderByProviderPaymentId.mockResolvedValue(null);
    repository.findPaymentMethodByProviderPaymentMethodId.mockResolvedValue({
      ...activePaymentMethod,
      status: 'pending',
      methodType: 'sbp',
      providerPaymentMethodId: 'sbp_binding_1',
    });
    mockedGetYooKassaPaymentMethod.mockResolvedValue({
      id: 'sbp_binding_1',
      type: 'sbp',
      saved: true,
      status: 'active',
    });
    const service = createService(repository);

    await service.handleYooKassaWebhook({
      type: 'notification',
      event: 'payment_method.active',
      object: {
        id: 'sbp_binding_1',
        type: 'sbp',
        status: 'active',
        saved: true,
      },
    });

    expect(
      repository.findPaymentMethodByProviderPaymentMethodId
    ).toHaveBeenCalledWith('sbp_binding_1');
    expect(repository.activatePaymentMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        providerPaymentMethodId: 'sbp_binding_1',
        enableAutoRenewForActiveAccess: true,
      })
    );
    // Событие способа оплаты не должно идти по платёжному пути (GET /payments).
    expect(mockedGetYooKassaPayment).not.toHaveBeenCalled();
  });

  it('correlates a payment_method.active webhook by metadata.userId when the id lookup misses', async () => {
    // Устойчивый fallback: если по providerPaymentMethodId привязку не нашли,
    // но событие несёт наш userId в metadata (мы кладём его при создании
    // привязки), активируем pending-способ этого пользователя.
    const repository = createRepository();
    repository.findPaymentMethodByProviderPaymentMethodId.mockResolvedValue(
      null
    );
    repository.findPaymentMethodByUserId.mockResolvedValue({
      ...activePaymentMethod,
      status: 'pending',
      methodType: 'sbp',
      providerPaymentMethodId: 'sbp_binding_1',
    });
    mockedGetYooKassaPaymentMethod.mockResolvedValue({
      id: 'sbp_binding_1',
      type: 'sbp',
      saved: true,
      status: 'active',
    });
    const service = createService(repository);

    await service.handleYooKassaWebhook({
      type: 'notification',
      event: 'payment_method.active',
      object: {
        id: 'sbp_binding_1',
        type: 'sbp',
        status: 'active',
        saved: true,
        metadata: { userId: 'user_1' },
      },
    });

    expect(repository.findPaymentMethodByUserId).toHaveBeenCalledWith('user_1');
    expect(repository.activatePaymentMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        providerPaymentMethodId: 'sbp_binding_1',
        enableAutoRenewForActiveAccess: true,
      })
    );
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

    expect(repository.activatePaymentMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        providerPaymentMethodId: 'pm_1',
        enableAutoRenewForActiveAccess: true,
      })
    );
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

    expect(repository.activatePaymentMethod).toHaveBeenCalledWith(
      expect.objectContaining({ enableAutoRenewForActiveAccess: true })
    );
  });

  it('requires a bound card and an active pass to enable auto-renewal', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(
      service.setAutoRenew({ userId: 'user_1', enabled: true })
    ).rejects.toThrow('привяжите способ оплаты');

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
    expect(repository.revokeRecurringPaymentConsent).toHaveBeenCalledWith({
      userId: 'user_1',
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
    expect(repository.fulfillPaidOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'renewal_order_1',
        requireExistingAutoRenewConsent: true,
      })
    );
  });

  it('confirms a successful renewal by email regardless of pass duration', async () => {
    const due = createAccess({
      planId: 'pass_7d',
      renewalPlanId: 'pass_7d',
      renewalAmountRub: 449,
      autoRenew: true,
      nextChargeAt: new Date('2026-07-31T09:00:00.000Z'),
    });
    const renewalOrder = createOrder({
      id: 'renewal_order_1',
      planId: 'pass_7d',
      providerPaymentId: null,
      status: 'pending',
      amountRub: 449,
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
    repository.findAccessByUserId.mockResolvedValue(
      createAccess({
        planId: 'pass_7d',
        currentPeriodEnd: new Date('2026-08-07T10:00:00.000Z'),
      })
    );
    mockedCreateYooKassaRecurringPayment.mockResolvedValue({
      id: 'renewal_payment_1',
      status: 'succeeded',
    });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '449.00',
      currency: 'RUB',
      metadata: { orderId: 'renewal_order_1' },
      paymentMethod: null,
    });
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(mockedSendRenewalChargedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        planName: 'Полный доступ · 7 дн.',
        amountRub: 449,
        accessUntil: new Date('2026-08-07T10:00:00.000Z'),
      })
    );
  });

  it('does not confirm a declined renewal', async () => {
    const due = createAccess();
    const renewalOrder = createOrder({
      id: 'renewal_order_1',
      providerPaymentId: null,
      status: 'pending',
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
      status: 'pending',
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

    expect(mockedSendRenewalChargedEmail).not.toHaveBeenCalled();
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

  it('honours the renewal kill-switch in the opportunistic status path', async () => {
    vi.stubEnv('BILLING_RENEWAL_DISABLED', 'true');
    try {
      const repository = createRepository();
      const service = createService(repository);

      await service.maybeRunAutoRenewal('user_1');

      expect(repository.listAccessDueForCharge).not.toHaveBeenCalled();
      expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
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

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: 'Сохранённый способ оплаты не найден',
      disableAutoRenew: true,
      expectedProviderPaymentId: 'payment_1',
      requireNoActivePaymentMethod: true,
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
  });

  it('marks a charge canceled, not quarantined, when consent changes before the first POST', async () => {
    const due = createAccess();
    const repository = createRepository();
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 1,
    });
    repository.findPaymentMethodByUserId
      .mockResolvedValueOnce(activePaymentMethod)
      .mockResolvedValueOnce({
        ...activePaymentMethod,
        providerPaymentMethodId: 'pm_new',
      });
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ id: 'renewal_not_attempted' })
    );
    repository.recordAccessChargeError.mockResolvedValue(false);
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.updatePaymentOrder).toHaveBeenCalledWith({
      id: 'renewal_not_attempted',
      status: 'canceled',
      onlyIfUnfulfilled: true,
      metadata: {
        renewalErrorKind: 'not_attempted',
        renewalErrorDiagnostic: expect.stringContaining(
          'согласие или сохранённый способ'
        ),
      },
      mergeMetadata: true,
    });
    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
  });

  it('defers renewal while a manual pass checkout is in progress', async () => {
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
    repository.createPaymentOrder.mockRejectedValue(
      new PassCheckoutInProgressError()
    );
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 1,
      failed: 0,
    });

    expect(repository.rescheduleAccessChargeVerification).toHaveBeenCalledWith({
      accessId: 'access_1',
      chargeAttempts: 0,
      retryAt: new Date('2026-07-31T11:00:00.000Z'),
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
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
    mockedCreateYooKassaRecurringPayment.mockRejectedValue({
      statusCode: 400,
      data: {
        id: 'provider_error_declined',
        code: 'payment_rejected',
        description: 'Payment was declined',
      },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('code=payment_rejected'),
      disableAutoRenew: false,
      deferRetryUntilPeriodEnd: true,
      retryAt: new Date('2026-08-01T10:00:00.000Z'),
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(mockedSendRenewalFailedEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('invalidates a missing saved payment method without pointless retries', async () => {
    const due = createAccess();
    const repository = createRepository();
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 1,
    });
    repository.findPaymentMethodByUserId.mockResolvedValue({
      ...activePaymentMethod,
      methodType: 'sbp',
      title: null,
      cardBrand: null,
      cardLast4: null,
      cardExpiryMonth: null,
      cardExpiryYear: null,
    });
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ id: 'renewal_order_sbp' })
    );
    mockedCreateYooKassaRecurringPayment.mockRejectedValue({
      statusCode: 400,
      data: {
        type: 'error',
        id: 'provider_error_1',
        code: 'invalid_request',
        description:
          "This payment_method_id doesn't exist. Specify the id of the saved payment_method",
        parameter: 'payment_method_id',
      },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 0,
      failed: 1,
    });

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringMatching(
        /HTTP 400.*provider_error_1.*invalid_request.*payment_method_id/
      ),
      disableAutoRenew: true,
      expectedProviderPaymentId: 'payment_1',
      requireNoActivePaymentMethod: true,
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(repository.deletePaymentMethodIfMatches).toHaveBeenCalledWith({
      userId: 'user_1',
      providerPaymentMethodId: 'pm_1',
    });
    expect(mockedSendRenewalFailedEmail).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it('does not disable a newly replaced method because the old id became invalid', async () => {
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
    repository.deletePaymentMethodIfMatches.mockResolvedValue(false);
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ id: 'renewal_order_replaced_method' })
    );
    mockedCreateYooKassaRecurringPayment.mockRejectedValue({
      statusCode: 404,
      data: {
        code: 'not_found',
        parameter: 'payment_method_id',
      },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('payment_method_id'),
      disableAutoRenew: false,
      deferRetryUntilPeriodEnd: true,
      retryAt: new Date('2026-08-01T10:00:00.000Z'),
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(mockedSendRenewalFailedEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('disables a payment method immediately when recurring permission was revoked', async () => {
    const due = createAccess();
    const renewalOrder = createOrder({
      id: 'renewal_order_1',
      providerPaymentId: null,
      status: 'pending',
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
      cancellationParty: 'payment_network',
      cancellationReason: 'permission_revoked',
    } as Awaited<ReturnType<typeof getYooKassaPayment>>);
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 0,
      failed: 1,
    });

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('permission_revoked'),
      disableAutoRenew: true,
      expectedProviderPaymentId: 'payment_1',
      requireNoActivePaymentMethod: true,
      restoreChargeAttemptsTo: 1,
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(repository.deletePaymentMethodIfMatches).toHaveBeenCalledWith({
      userId: 'user_1',
      providerPaymentMethodId: 'pm_1',
    });
  });

  it('schedules a dated retry for a transient payment refusal', async () => {
    const due = createAccess();
    const renewalOrder = createOrder({
      id: 'renewal_order_1',
      providerPaymentId: null,
      status: 'pending',
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
      cancellationParty: 'payment_network',
      cancellationReason: 'insufficient_funds',
    } as Awaited<ReturnType<typeof getYooKassaPayment>>);
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('insufficient_funds'),
      disableAutoRenew: false,
      deferRetryUntilPeriodEnd: true,
      retryAt: new Date('2026-08-01T10:00:00.000Z'),
      restoreChargeAttemptsTo: 1,
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(repository.deletePaymentMethodIfMatches).not.toHaveBeenCalled();
  });

  it('retries an indeterminate provider response with the same idempotency key', async () => {
    const due = createAccess();
    const renewalOrder = createOrder({
      id: 'renewal_order_stable',
      providerPaymentId: null,
      status: 'pending',
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
    mockedCreateYooKassaRecurringPayment
      .mockRejectedValueOnce({
        statusCode: 500,
        data: { type: 'error', code: 'internal_server_error' },
      })
      .mockResolvedValueOnce({
        id: 'renewal_payment_1',
        status: 'succeeded',
      });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'renewal_order_stable' },
      paymentMethod: null,
      cancellationParty: null,
      cancellationReason: null,
    } as Awaited<ReturnType<typeof getYooKassaPayment>>);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 1,
      failed: 0,
    });

    expect(mockedCreateYooKassaRecurringPayment).toHaveBeenCalledTimes(2);
    const firstInput = mockedCreateYooKassaRecurringPayment.mock.calls[0]?.[0];
    const secondInput = mockedCreateYooKassaRecurringPayment.mock.calls[1]?.[0];
    expect(firstInput?.idempotenceKey).toBe('renewal_order_stable');
    expect(secondInput).toEqual(firstInput);
    expect(repository.fulfillPaidOrder).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it('backs off after YooKassa rate limiting without consuming an attempt', async () => {
    const due = createAccess({ chargeAttempts: 1 });
    const renewalOrder = createOrder({
      id: 'renewal_order_rate_limited',
      providerPaymentId: null,
      status: 'pending',
    });
    const repository = createRepository(renewalOrder);
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 2,
    });
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.createPaymentOrder.mockResolvedValue(renewalOrder);
    mockedCreateYooKassaRecurringPayment.mockRejectedValue({
      statusCode: 429,
      data: { code: 'too_many_requests' },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 0,
      failed: 1,
    });

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('HTTP 429'),
      disableAutoRenew: false,
      retryAt: new Date('2026-07-31T10:15:00.000Z'),
      restoreChargeAttemptsTo: 1,
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(repository.updatePaymentOrder).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
    expect(mockedSendRenewalFailedEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('polls a pending recurring payment without consuming a failed-attempt slot', async () => {
    const due = createAccess();
    const renewalOrder = createOrder({
      id: 'renewal_order_pending',
      providerPaymentId: null,
      status: 'pending',
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
      id: 'renewal_payment_pending',
      status: 'pending',
    });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_pending',
      status: 'pending',
      paid: false,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'renewal_order_pending' },
      paymentMethod: null,
      cancellationParty: null,
      cancellationReason: null,
    });
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 1,
      failed: 0,
    });

    expect(repository.rescheduleAccessChargeVerification).toHaveBeenCalledWith({
      accessId: 'access_1',
      chargeAttempts: 0,
      retryAt: new Date('2026-07-31T11:00:00.000Z'),
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      expectedPendingOrderId: 'renewal_order_pending',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(repository.recordAccessChargeError).not.toHaveBeenCalled();
  });

  it('finalizes pending-to-canceled as the original third failed attempt', async () => {
    const due = createAccess({ chargeAttempts: 2 });
    const renewalOrder = createOrder({
      id: 'renewal_order_pending_third',
      providerPaymentId: 'renewal_payment_pending_third',
      status: 'pending',
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
        renewalCycleEnd: due.currentPeriodEnd.toISOString(),
        renewalAttemptNumber: 3,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(renewalOrder);
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 3,
    });
    repository.findUnfulfilledRenewalPaymentOrder.mockResolvedValue(
      renewalOrder
    );
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_pending_third',
      status: 'canceled',
      paid: false,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'renewal_order_pending_third' },
      paymentMethod: null,
      cancellationParty: 'payment_network',
      cancellationReason: 'insufficient_funds',
    });
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('insufficient_funds'),
      disableAutoRenew: true,
      restoreChargeAttemptsTo: 3,
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(repository.markRenewalFailureHandled).toHaveBeenCalledWith({
      orderId: 'renewal_order_pending_third',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(mockedSendRenewalFailedEmail).toHaveBeenCalledOnce();
  });

  it('reconciles a legacy failed renewal with a provider id instead of charging again', async () => {
    const due = createAccess({ chargeAttempts: 1 });
    const legacyOrder = createOrder({
      id: 'legacy_failed_with_payment',
      providerPaymentId: 'legacy_payment_1',
      status: 'failed',
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
      },
    });
    const repository = createRepository(legacyOrder);
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 2,
    });
    repository.findUnfulfilledRenewalPaymentOrder.mockResolvedValue(
      legacyOrder
    );
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'legacy_payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'legacy_failed_with_payment' },
      paymentMethod: null,
      cancellationParty: null,
      cancellationReason: null,
    });
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 1,
      failed: 0,
    });

    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
    expect(repository.fulfillPaidOrder).toHaveBeenCalledOnce();
  });

  it('stops a legacy failed renewal without a provider id as indeterminate', async () => {
    const due = createAccess({ chargeAttempts: 1 });
    const legacyOrder = createOrder({
      id: 'legacy_failed_without_payment',
      providerPaymentId: null,
      status: 'failed',
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
      },
    });
    const repository = createRepository(legacyOrder);
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 2,
    });
    repository.findUnfulfilledRenewalPaymentOrder.mockResolvedValue(
      legacyOrder
    );
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.updatePaymentOrder).toHaveBeenCalledWith({
      id: 'legacy_failed_without_payment',
      status: 'indeterminate',
      onlyIfUnfulfilled: true,
      metadata: {
        renewalErrorDiagnostic: expect.stringContaining('снимок запроса'),
        renewalQuarantined: true,
        renewalRetryAt: expect.any(String),
      },
      mergeMetadata: true,
    });
    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
    expect(repository.recordAccessChargeError).toHaveBeenCalledWith(
      expect.objectContaining({
        disableAutoRenew: true,
        expectedProviderPaymentId: 'payment_1',
      })
    );
  });

  it('does not overwrite a successful concurrent renewal with a late failure', async () => {
    const due = createAccess({ chargeAttempts: 2 });
    const repository = createRepository();
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 3,
    });
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.createPaymentOrder.mockResolvedValue(
      createOrder({ id: 'renewal_order_race' })
    );
    repository.recordAccessChargeError.mockResolvedValue(false);
    mockedCreateYooKassaRecurringPayment.mockRejectedValue({
      statusCode: 400,
      data: { code: 'payment_rejected' },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedProviderPaymentId: 'payment_1',
      })
    );
    expect(repository.markRenewalFailureHandled).toHaveBeenCalledWith({
      orderId: 'renewal_order_race',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(mockedSendRenewalFailedEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('reuses the same pending renewal order on a later indeterminate retry', async () => {
    const due = createAccess();
    const firstEmail = 'first@example.com';
    const renewalOrder = createOrder({
      id: 'renewal_order_persistent',
      providerPaymentId: null,
      status: 'pending',
      createdAt: new Date('2026-07-31T10:00:00.000Z'),
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
        renewalCycleEnd: due.currentPeriodEnd.toISOString(),
        renewalAttemptNumber: 1,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: firstEmail,
        },
      },
    });
    const repository = createRepository(renewalOrder);
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge
      .mockResolvedValueOnce({ ...due, chargeAttempts: 1 })
      .mockResolvedValueOnce({ ...due, chargeAttempts: 2 });
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.findUserEmail
      .mockResolvedValueOnce(firstEmail)
      .mockResolvedValueOnce('changed@example.com');
    repository.findUnfulfilledRenewalPaymentOrder
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(renewalOrder);
    repository.createPaymentOrder.mockResolvedValue(renewalOrder);
    mockedCreateYooKassaRecurringPayment
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValueOnce({
        id: 'renewal_payment_1',
        status: 'succeeded',
      });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '1190.00',
      currency: 'RUB',
      metadata: { orderId: 'renewal_order_persistent' },
      paymentMethod: null,
      cancellationParty: null,
      cancellationReason: null,
    } as Awaited<ReturnType<typeof getYooKassaPayment>>);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await expect(
      service.runAutoRenewalSweep({
        now: new Date('2026-07-31T10:00:00.000Z'),
      })
    ).resolves.toEqual({ processed: 0, failed: 1 });
    await expect(
      service.runAutoRenewalSweep({
        now: new Date('2026-07-31T11:00:00.000Z'),
      })
    ).resolves.toEqual({ processed: 1, failed: 0 });

    expect(repository.createPaymentOrder).toHaveBeenCalledOnce();
    expect(mockedCreateYooKassaRecurringPayment).toHaveBeenCalledTimes(3);
    const firstInput = mockedCreateYooKassaRecurringPayment.mock.calls[0]?.[0];
    for (const [input] of mockedCreateYooKassaRecurringPayment.mock.calls) {
      expect(input).toEqual(firstInput);
    }
    expect(firstInput?.idempotenceKey).toBe('renewal_order_persistent');
    expect(repository.findUnfulfilledRenewalPaymentOrder).toHaveBeenCalledWith({
      userId: 'user_1',
      accessId: 'access_1',
    });
    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('HTTP 503'),
      disableAutoRenew: false,
      retryAt: new Date('2026-07-31T11:00:00.000Z'),
      restoreChargeAttemptsTo: 0,
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(repository.fulfillPaidOrder).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it('does not consume the business retry budget for an indeterminate result', async () => {
    const due = createAccess();
    const renewalOrder = createOrder({
      id: 'renewal_order_uncertain',
      providerPaymentId: null,
      status: 'pending',
      createdAt: new Date('2026-07-31T09:00:00.000Z'),
    });
    const repository = createRepository(renewalOrder);
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 3,
    });
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    repository.createPaymentOrder.mockResolvedValue(renewalOrder);
    mockedCreateYooKassaRecurringPayment.mockRejectedValue({ statusCode: 500 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 0,
      failed: 1,
    });

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('HTTP 500'),
      disableAutoRenew: false,
      retryAt: new Date('2026-07-31T11:00:00.000Z'),
      restoreChargeAttemptsTo: 2,
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(repository.updatePaymentOrder).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
    errorSpy.mockRestore();
  });

  it('keeps a retry slot open when verification of the third payment times out', async () => {
    const due = createAccess({ chargeAttempts: 2 });
    const renewalOrder = createOrder({
      id: 'renewal_order_verify_timeout',
      providerPaymentId: 'renewal_payment_verify_timeout',
      status: 'pending',
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
        renewalCycleEnd: due.currentPeriodEnd.toISOString(),
        renewalAttemptNumber: 3,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
    });
    const repository = createRepository(renewalOrder);
    repository.listAccessDueForCharge.mockResolvedValue([due]);
    repository.claimAccessForCharge.mockResolvedValue({
      ...due,
      chargeAttempts: 3,
    });
    repository.findUnfulfilledRenewalPaymentOrder.mockResolvedValue(
      renewalOrder
    );
    repository.findPaymentMethodByUserId.mockResolvedValue(
      activePaymentMethod
    );
    mockedGetYooKassaPayment.mockRejectedValue({ statusCode: 503 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('HTTP 503'),
      disableAutoRenew: false,
      retryAt: new Date('2026-07-31T11:00:00.000Z'),
      restoreChargeAttemptsTo: 2,
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    errorSpy.mockRestore();
  });

  it('stops unsafe POST retries when the idempotency window has expired', async () => {
    const due = createAccess();
    const renewalOrder = createOrder({
      id: 'renewal_order_expired_key',
      providerPaymentId: null,
      status: 'pending',
      createdAt: new Date('2026-07-30T10:00:00.000Z'),
      metadata: {
        userId: 'user_1',
        planId: 'pass_30d',
        renewal: true,
        autoRenew: true,
        accessId: 'access_1',
        renewalCycleEnd: due.currentPeriodEnd.toISOString(),
        renewalAttemptNumber: 1,
        renewalAccessProviderPaymentId: 'payment_1',
        renewalRequest: {
          amountRub: 1190,
          description: 'Гласно Полный доступ · 30 дн. (автопродление)',
          paymentMethodId: 'pm_1',
          planId: 'pass_30d',
          receiptEmail: 'user@example.com',
        },
      },
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
    repository.findUnfulfilledRenewalPaymentOrder.mockResolvedValue(
      renewalOrder
    );
    mockedCreateYooKassaRecurringPayment.mockRejectedValue({ statusCode: 503 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createService(repository);

    await service.runAutoRenewalSweep();

    expect(repository.updatePaymentOrder).toHaveBeenCalledWith({
      id: 'renewal_order_expired_key',
      status: 'indeterminate',
      onlyIfUnfulfilled: true,
      metadata: {
        renewalErrorDiagnostic: expect.stringContaining('Idempotence-Key'),
        renewalQuarantined: true,
        renewalRetryAt: expect.any(String),
      },
      mergeMetadata: true,
    });
    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('Idempotence-Key'),
      disableAutoRenew: true,
      restoreChargeAttemptsTo: 1,
      expectedProviderPaymentId: 'payment_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
    expect(mockedCreateYooKassaRecurringPayment).not.toHaveBeenCalled();
    expect(mockedSendRenewalManualReviewEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        profileUrl: 'https://glasno.test/profile',
      })
    );
    errorSpy.mockRestore();
  });

  it('does not report a mismatched succeeded payment as a renewal success', async () => {
    const due = createAccess();
    const renewalOrder = createOrder({
      id: 'renewal_order_mismatch',
      providerPaymentId: null,
      status: 'pending',
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
      id: 'renewal_payment_mismatch',
      status: 'succeeded',
    });
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'renewal_payment_mismatch',
      status: 'succeeded',
      paid: true,
      amountValue: '1.00',
      currency: 'RUB',
      metadata: { orderId: 'renewal_order_mismatch' },
      paymentMethod: null,
      cancellationParty: null,
      cancellationReason: null,
    });
    const service = createService(repository);

    await expect(service.runAutoRenewalSweep()).resolves.toEqual({
      processed: 0,
      failed: 1,
    });

    expect(repository.fulfillPaidOrder).not.toHaveBeenCalled();
    expect(mockedSendRenewalChargedEmail).not.toHaveBeenCalled();
    expect(repository.updatePaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'renewal_order_mismatch',
        status: 'verification_failed',
        onlyIfUnfulfilled: true,
      })
    );
    expect(repository.recordAccessChargeError).toHaveBeenCalledWith({
      accessId: 'access_1',
      error: expect.stringContaining('сумма или валюта не совпадает'),
      disableAutoRenew: true,
      restoreChargeAttemptsTo: 1,
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
      now: new Date('2026-07-31T10:00:00.000Z'),
    });
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
      restoreChargeAttemptsTo: 3,
      expectedProviderPaymentId: 'payment_1',
      expectedActivePaymentMethodId: 'pm_1',
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

describe('resolveRenewalNoticeLeadMs', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('stays silent for short passes and scales the lead with duration', () => {
    expect(resolveRenewalNoticeLeadMs(7)).toBeNull();
    expect(resolveRenewalNoticeLeadMs(15)).toBeNull();
    expect(resolveRenewalNoticeLeadMs(29)).toBeNull();
    expect(resolveRenewalNoticeLeadMs(30)).toBe(3 * DAY);
    expect(resolveRenewalNoticeLeadMs(89)).toBe(3 * DAY);
    expect(resolveRenewalNoticeLeadMs(90)).toBe(7 * DAY);
    expect(resolveRenewalNoticeLeadMs(365)).toBe(7 * DAY);
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

  it('never notifies short passes, even on the charge date', async () => {
    const access = createAccess({
      planId: 'pass_7d',
      renewalPlanId: 'pass_7d',
      renewalAmountRub: 449,
      // Списание уже сегодня — коротким пропускам письмо всё равно не шлём.
      nextChargeAt: new Date('2026-07-29T10:00:00.000Z'),
    });
    const repository = createRepository();
    repository.listAccessDueForRenewalNotice.mockResolvedValue([access]);
    const service = createService(repository);

    await expect(service.runRenewalNoticeSweep()).resolves.toEqual({
      sent: 0,
      skipped: 1,
    });
    expect(repository.claimRenewalNotice).not.toHaveBeenCalled();
    expect(mockedSendRenewalNoticeEmail).not.toHaveBeenCalled();
  });

  it('notifies long passes 7 days ahead', async () => {
    const access = createAccess({
      planId: 'pass_365d',
      renewalPlanId: 'pass_365d',
      renewalAmountRub: 4990,
      // Через 3 дня письмо для 30-дневного ушло бы, для годового — рано.
      nextChargeAt: new Date('2026-08-05T10:00:00.000Z'),
    });
    const repository = createRepository();
    repository.listAccessDueForRenewalNotice.mockResolvedValue([access]);
    const service = createService(repository);

    await expect(service.runRenewalNoticeSweep()).resolves.toEqual({
      sent: 1,
      skipped: 0,
    });
    expect(mockedSendRenewalNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        planName: 'Полный доступ · 365 дн.',
        amountRub: 4990,
      })
    );
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

  it('never puts localhost into production email links', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const access = createAccess({
        currentPeriodEnd: new Date('2026-08-01T10:00:00.000Z'),
        nextChargeAt: new Date('2026-08-01T10:00:00.000Z'),
      });
      const repository = createRepository();
      repository.listAccessDueForRenewalNotice.mockResolvedValue([access]);
      const service = new BillingService({
        repository,
        config: {
          yookassa: { shopId: '123456', secretKey: 'test_secret' },
          appUrl: 'http://localhost:3000',
        },
      });

      await service.runRenewalNoticeSweep({
        now: new Date('2026-07-29T10:00:00.000Z'),
      });

      expect(mockedSendRenewalNoticeEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          pricingUrl: 'https://my.glasno.app/pricing',
        })
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

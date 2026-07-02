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
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    ...overrides,
  };
}

function createRepository(order = createOrder()) {
  let activeSubscription: SubscriptionRecord | null = null;
  const repository = {
    countOwnerSessions: vi.fn().mockResolvedValue(1),
    findActiveSubscriptionByUserId: vi
      .fn()
      .mockImplementation(async () => activeSubscription),
    findActiveSubscriptionsByUserId: vi
      .fn()
      .mockImplementation(async () =>
        activeSubscription ? [activeSubscription] : []
      ),
    countRealtimeVoiceUsageSeconds: vi.fn().mockResolvedValue(0),
    createPaymentOrder: vi.fn(),
    findPaymentOrderById: vi.fn().mockResolvedValue(order),
    findPaymentOrderByProviderPaymentId: vi.fn().mockResolvedValue(order),
    findLatestPaymentOrderByUserId: vi.fn().mockResolvedValue(order),
    updatePaymentOrder: vi.fn().mockResolvedValue(order),
    findSubscriptionByProviderPaymentId: vi.fn().mockResolvedValue(null),
    grantSubscription: vi.fn().mockImplementation(async (input) => {
      activeSubscription = createSubscription(input);
      return activeSubscription;
    }),
  } satisfies BillingRepository;

  return repository;
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
    });
    const service = new BillingService({
      repository,
      config: {
        yookassa: { shopId: '123456', secretKey: 'test_secret' },
        appUrl: 'https://jobai.test',
      },
    });

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

    expect(repository.grantSubscription).toHaveBeenCalledWith({
      userId: 'user_1',
      planId: 'pro_monthly',
      provider: 'yookassa',
      providerPaymentId: 'payment_1',
      currentPeriodEnd: new Date('2026-07-31T10:00:00.000Z'),
    });
  });

  it('does not grant access twice for the same YooKassa payment', async () => {
    const existingSubscription = createSubscription();
    const repository = createRepository();
    repository.findSubscriptionByProviderPaymentId.mockResolvedValue(
      existingSubscription
    );
    repository.findActiveSubscriptionByUserId.mockResolvedValue(
      existingSubscription
    );
    mockedGetYooKassaPayment.mockResolvedValue({
      id: 'payment_1',
      status: 'succeeded',
      paid: true,
      amountValue: '990.00',
      currency: 'RUB',
      metadata: { orderId: 'order_1' },
    });
    const service = new BillingService({
      repository,
      config: {
        yookassa: { shopId: '123456', secretKey: 'test_secret' },
        appUrl: 'https://jobai.test',
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

    expect(repository.grantSubscription).not.toHaveBeenCalled();
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
    });
    const service = new BillingService({
      repository,
      config: {
        yookassa: { shopId: '123456', secretKey: 'test_secret' },
        appUrl: 'https://jobai.test',
      },
    });

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

    expect(repository.grantSubscription).not.toHaveBeenCalled();
    expect(repository.updatePaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          amountMatched: false,
        }),
      })
    );
  });
});

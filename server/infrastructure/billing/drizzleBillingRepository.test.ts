import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@/server/infrastructure/db/client';
import { DrizzleBillingRepository } from './drizzleBillingRepository';
import {
  PassCheckoutInProgressError,
  RenewalPaymentQuarantinedError,
} from '@/server/interface/billingRepository';

const database = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock('@/server/infrastructure/db/client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/server/infrastructure/db/client')
    >();
  return {
    ...actual,
    getDb: database.getDb,
  };
});

const NOW = new Date('2026-07-01T10:00:00.000Z');
const ACTIVE_END = new Date('2026-07-20T10:00:00.000Z');
const EXPIRED_END = new Date('2026-06-20T10:00:00.000Z');

const PASS_30D = {
  id: 'pass_30d',
  type: 'pass' as const,
  durationDays: 30,
  realtimeVoiceMinutes: 60,
  priceRub: 1190,
};

const PASS_180D = {
  id: 'pass_180d',
  type: 'pass' as const,
  durationDays: 180,
  realtimeVoiceMinutes: 180,
  priceRub: 4990,
};

// Мок цепочек drizzle-select: очередной вызов limit() отдаёт следующий набор
// строк из очереди независимо от формы цепочки (where/join/orderBy).
function createSelectDb(rowsQueue: unknown[][]) {
  return {
    select: vi.fn().mockImplementation(() => {
      const query: Record<string, unknown> = {};
      const chain = () => query;
      Object.assign(query, {
        from: chain,
        where: chain,
        innerJoin: chain,
        leftJoin: chain,
        orderBy: chain,
        limit: async () => rowsQueue.shift() ?? [],
      });
      return query;
    }),
  };
}

describe('DrizzleBillingRepository (модель доступа v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('считает незавершённую сессию использованным бесплатным интервью', async () => {
    // Попытка триала расходуется созданием сессии: одна running-сессия без
    // отчёта — это уже freeSessionsUsed = 1.
    const db = createSelectDb([
      [{ value: 1 }],
      [{ email: 'hello@mentala.app', telegramId: null }],
      [],
    ]);
    database.getDb.mockReturnValue(db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.countOwnerFreeSessionsUsed({
        anonymousSessionId: 'anon_running',
        userId: 'user_1',
      })
    ).resolves.toBe(1);
  });

  it('учитывает историю попыток при нуле сессий (пересозданный аккаунт)', async () => {
    const db = createSelectDb([
      [{ value: 0 }],
      [{ email: 'hello@mentala.app', telegramId: null }],
      [{ id: 'history_1' }],
    ]);
    database.getDb.mockReturnValue(db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.countOwnerFreeSessionsUsed({
        anonymousSessionId: 'anon_recreated',
        userId: 'user_1',
      })
    ).resolves.toBe(1);
  });

  it('возвращает самую свежую незавершённую сессию для «продолжить интервью»', async () => {
    const createdAt = new Date('2026-07-15T10:00:00.000Z');
    const db = createSelectDb([
      [{ id: 'session_1', vacancyTitle: 'Frontend-разработчик', createdAt }],
    ]);
    database.getDb.mockReturnValue(db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.findOwnerUnfinishedSession({
        anonymousSessionId: 'anon_1',
        userId: null,
      })
    ).resolves.toEqual({
      id: 'session_1',
      vacancyTitle: 'Frontend-разработчик',
      createdAt,
    });
  });

  it('не предлагает продолжение, когда незавершённых сессий нет', async () => {
    const db = createSelectDb([[]]);
    database.getDb.mockReturnValue(db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.findOwnerUnfinishedSession({
        anonymousSessionId: 'anon_1',
        userId: null,
      })
    ).resolves.toBeNull();
  });

  it('creates the access row with fixed renewal terms on the first pass purchase', async () => {
    const harness = createDbHarness({ savedCardWithPayment: true });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.fulfillPaidOrder({
        orderId: 'order_1',
        providerPaymentId: 'payment_1',
        plan: PASS_30D,
        autoRenew: true,
        paymentMethod: {
          providerPaymentMethodId: 'pm_1',
          cardBrand: 'Visa',
          cardLast4: '1111',
        },
        now: NOW,
      })
    ).resolves.toEqual({ fulfilled: true, alreadyFulfilled: false });

    expect(harness.inserts).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        userId: 'user_1',
        planId: 'pass_30d',
        providerPaymentId: 'payment_1',
        currentPeriodEnd: new Date('2026-07-31T10:00:00.000Z'),
        autoRenew: true,
        nextChargeAt: new Date('2026-07-31T10:00:00.000Z'),
        renewalPlanId: 'pass_30d',
        renewalAmountRub: 1190,
      }),
    });
    expect(harness.inserts).toContainEqual({
      table: schema.realtimeMinuteGrants,
      values: expect.objectContaining({
        sourceType: 'pass',
        subscriptionId: 'access_new',
        totalSeconds: 60 * 60,
        expiresAt: new Date('2026-07-31T10:00:00.000Z'),
      }),
    });
    expect(harness.updates).toContainEqual({
      table: schema.paymentOrders,
      values: expect.objectContaining({
        providerPaymentId: 'payment_1',
        status: 'succeeded',
        fulfilledAt: NOW,
      }),
    });
  });

  it('keeps the purchase one-off when auto-renew was requested but no card exists', async () => {
    const harness = createDbHarness();
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.fulfillPaidOrder({
      orderId: 'order_1',
      providerPaymentId: 'payment_1',
      plan: PASS_30D,
      autoRenew: true,
      paymentMethod: null,
      now: NOW,
    });

    expect(harness.inserts).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        autoRenew: false,
        nextChargeAt: null,
      }),
    });
  });

  it('keeps a new purchase one-off while an earlier renewal is unresolved', async () => {
    const harness = createDbHarness({
      activeCard: true,
      unresolvedRenewal: true,
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.fulfillPaidOrder({
      orderId: 'order_1',
      providerPaymentId: 'payment_1',
      plan: PASS_30D,
      autoRenew: true,
      paymentMethod: null,
      now: NOW,
    });

    expect(harness.inserts).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        autoRenew: false,
        nextChargeAt: null,
      }),
    });
  });

  it('atomically blocks a new pass order while a renewal is unresolved', async () => {
    const harness = createDbHarness({ unresolvedRenewal: true });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.createPaymentOrder({
        userId: 'user_1',
        planId: 'pass_30d',
        amountRub: 1190,
        currency: 'RUB',
        metadata: { autoRenew: true },
        accessPaymentFlow: 'checkout',
      })
    ).rejects.toBeInstanceOf(RenewalPaymentQuarantinedError);
    expect(harness.inserts).not.toContainEqual(
      expect.objectContaining({ table: schema.paymentOrders })
    );
  });

  it('atomically defers a renewal while a manual pass checkout is pending', async () => {
    const harness = createDbHarness({ manualPassCheckout: true });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.createPaymentOrder({
        userId: 'user_1',
        planId: 'pass_30d',
        amountRub: 1190,
        currency: 'RUB',
        metadata: { renewal: true },
        accessPaymentFlow: 'renewal',
        conflictingPassPlanIds: ['pass_7d', 'pass_30d'],
      })
    ).rejects.toBeInstanceOf(PassCheckoutInProgressError);
    expect(harness.inserts).not.toContainEqual(
      expect.objectContaining({ table: schema.paymentOrders })
    );
  });

  it('moves the next charge to the retry date after a transient failure', async () => {
    const harness = createDbHarness({
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: true },
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();
    const retryAt = new Date('2026-07-02T10:00:00.000Z');

    await repository.recordAccessChargeError({
      accessId: 'access_1',
      error: 'insufficient_funds',
      disableAutoRenew: false,
      retryAt,
      now: NOW,
    });

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: {
        lastChargeError: 'insufficient_funds',
        nextChargeAt: retryAt,
        lastChargeAttemptAt: null,
        updatedAt: NOW,
      },
    });
  });

  it('revokes auto-renewal consent and the saved method atomically', async () => {
    const harness = createDbHarness({
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: true },
      activeCard: true,
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.revokeRecurringPaymentConsent({
      userId: 'user_1',
      now: NOW,
    });

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: {
        autoRenew: false,
        nextChargeAt: null,
        renewalNoticeSentAt: null,
        updatedAt: NOW,
      },
    });
    expect(harness.deletes).toContain(schema.userPaymentMethods);
  });

  it('enables auto-renewal atomically only while an active method exists', async () => {
    const withMethod = createDbHarness({
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: false },
      activeCard: true,
    });
    database.getDb.mockReturnValue(withMethod.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.setAccessAutoRenew({
        userId: 'user_1',
        autoRenew: true,
        now: NOW,
      })
    ).resolves.toBe(true);
    expect(withMethod.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({ autoRenew: true }),
    });

    const withoutMethod = createDbHarness({
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: false },
    });
    database.getDb.mockReturnValue(withoutMethod.db);
    const repositoryWithoutMethod = new DrizzleBillingRepository();
    await expect(
      repositoryWithoutMethod.setAccessAutoRenew({
        userId: 'user_1',
        autoRenew: true,
        now: NOW,
      })
    ).resolves.toBe(false);
    expect(withoutMethod.updates).toEqual([]);

    const withUnknownRenewal = createDbHarness({
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: false },
      activeCard: true,
      unresolvedRenewal: true,
    });
    database.getDb.mockReturnValue(withUnknownRenewal.db);
    const repositoryWithUnknownRenewal = new DrizzleBillingRepository();
    await expect(
      repositoryWithUnknownRenewal.setAccessAutoRenew({
        userId: 'user_1',
        autoRenew: true,
        now: NOW,
      })
    ).resolves.toBe(false);
  });

  it('activates the exact pending method and renewal under the user lock', async () => {
    const harness = createDbHarness({
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: false },
      activePaymentMethodId: 'pm_1',
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.activatePaymentMethod({
        userId: 'user_1',
        providerPaymentMethodId: 'pm_1',
        methodType: 'sbp',
        enableAutoRenewForActiveAccess: true,
        now: NOW,
      })
    ).resolves.toBe(true);

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        autoRenew: true,
        chargeAttempts: 0,
        lastChargeError: null,
      }),
    });
  });

  it('does not enable a new method while an old renewal outcome is unknown', async () => {
    const harness = createDbHarness({
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: true },
      activePaymentMethodId: 'pm_new',
      unresolvedRenewal: true,
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.activatePaymentMethod({
        userId: 'user_1',
        providerPaymentMethodId: 'pm_new',
        enableAutoRenewForActiveAccess: true,
        now: NOW,
      })
    ).resolves.toBe(true);

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        autoRenew: false,
        nextChargeAt: null,
      }),
    });
  });

  it('deletes only the saved payment method that produced the provider error', async () => {
    const harness = createDbHarness({ activeCard: true });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.deletePaymentMethodIfMatches({
        userId: 'user_1',
        providerPaymentMethodId: 'pm_1',
      })
    ).resolves.toBe(true);

    expect(harness.deletes).toContain(schema.userPaymentMethods);
  });

  it('restores the charge-attempt budget for an indeterminate provider result', async () => {
    const harness = createDbHarness({
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: true },
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.recordAccessChargeError({
      accessId: 'access_1',
      error: 'HTTP 500',
      disableAutoRenew: false,
      retryAt: new Date('2026-07-01T11:00:00.000Z'),
      restoreChargeAttemptsTo: 0,
      now: NOW,
    });

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        chargeAttempts: 0,
        lastChargeAttemptAt: null,
      }),
    });
  });

  it('finds an unhandled renewal order before creating another charge', async () => {
    const orderRow = {
      id: 'renewal_order_1',
      userId: 'user_1',
      planId: 'pass_30d',
      provider: 'yookassa',
      providerPaymentId: null,
      status: 'pending',
      amountRub: 1190,
      currency: 'RUB',
      confirmationUrl: null,
      metadata: {
        renewal: true,
        accessId: 'access_1',
        renewalCycleEnd: ACTIVE_END.toISOString(),
      },
      fulfilledAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const db = createSelectDb([[orderRow]]);
    database.getDb.mockReturnValue(db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.findUnfulfilledRenewalPaymentOrder({
        userId: 'user_1',
        accessId: 'access_1',
      })
    ).resolves.toMatchObject({
      id: 'renewal_order_1',
      status: 'pending',
      metadata: expect.objectContaining({
        renewalCycleEnd: ACTIVE_END.toISOString(),
      }),
    });
  });

  it('does not restore auto-renewal after a delayed renewal success and user opt-out', async () => {
    const harness = createDbHarness({
      access: { currentPeriodEnd: EXPIRED_END, autoRenew: false },
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.fulfillPaidOrder({
      orderId: 'order_1',
      providerPaymentId: 'payment_late',
      plan: PASS_30D,
      autoRenew: true,
      requireExistingAutoRenewConsent: true,
      paymentMethod: {
        providerPaymentMethodId: 'pm_revoked',
        methodType: 'sbp',
      },
      now: NOW,
    });

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        autoRenew: false,
        nextChargeAt: null,
      }),
    });
    expect(harness.inserts).not.toContainEqual(
      expect.objectContaining({ table: schema.userPaymentMethods })
    );
  });

  it('does not replace a newly bound method with the method from a late webhook', async () => {
    const harness = createDbHarness({
      access: { currentPeriodEnd: EXPIRED_END, autoRenew: true },
      activePaymentMethodId: 'pm_new',
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.fulfillPaidOrder({
      orderId: 'order_1',
      providerPaymentId: 'payment_late_old_method',
      plan: PASS_30D,
      autoRenew: true,
      requireExistingAutoRenewConsent: true,
      expectedPaymentMethodId: 'pm_old',
      paymentMethod: {
        providerPaymentMethodId: 'pm_old',
        methodType: 'sbp',
      },
      now: NOW,
    });

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        autoRenew: true,
        nextChargeAt: new Date('2026-07-31T10:00:00.000Z'),
      }),
    });
    expect(harness.inserts).not.toContainEqual(
      expect.objectContaining({ table: schema.userPaymentMethods })
    );
  });

  it('does not overwrite a newer renewal agreement with a stale success', async () => {
    const harness = createDbHarness({
      activePaymentMethodId: 'pm_1',
      access: {
        currentPeriodEnd: ACTIVE_END,
        autoRenew: true,
        planId: 'pass_7d',
        renewalPlanId: 'pass_7d',
        renewalAmountRub: 449,
        providerPaymentId: 'payment_newer_agreement',
      },
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.fulfillPaidOrder({
      orderId: 'order_1',
      providerPaymentId: 'payment_late_renewal',
      plan: PASS_30D,
      autoRenew: true,
      requireExistingAutoRenewConsent: true,
      expectedPaymentMethodId: 'pm_1',
      expectedAccessProviderPaymentId: 'payment_old_agreement',
      paymentMethod: null,
      now: NOW,
    });

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        planId: 'pass_30d',
        renewalPlanId: 'pass_7d',
        renewalAmountRub: 449,
      }),
    });
  });

  it('extends the active pass from its period end and resets the charge cycle', async () => {
    const harness = createDbHarness({
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: false },
      activeCard: true,
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.fulfillPaidOrder({
      orderId: 'order_1',
      providerPaymentId: 'payment_2',
      plan: PASS_30D,
      autoRenew: true,
      paymentMethod: null,
      now: NOW,
    });

    // Продление обновляет существующую запись, а не создаёт новую.
    expect(harness.inserts).not.toContainEqual(
      expect.objectContaining({ table: schema.userSubscriptions })
    );
    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        planId: 'pass_30d',
        providerPaymentId: 'payment_2',
        // Повторная покупка добавляет срок к концу текущего периода.
        currentPeriodEnd: new Date('2026-08-19T10:00:00.000Z'),
        autoRenew: true,
        nextChargeAt: new Date('2026-08-19T10:00:00.000Z'),
        chargeAttempts: 0,
        lastChargeError: null,
        renewalPlanId: 'pass_30d',
        renewalAmountRub: 1190,
        renewalNoticeSentAt: null,
      }),
    });
    // Живые минуты доезжают до нового конца доступа.
    expect(harness.updates).toContainEqual({
      table: schema.realtimeMinuteGrants,
      values: expect.objectContaining({
        expiresAt: new Date('2026-08-19T10:00:00.000Z'),
      }),
    });
  });

  it('restarts the expired pass from now instead of stacking on the past date', async () => {
    const harness = createDbHarness({
      access: { currentPeriodEnd: EXPIRED_END, autoRenew: false },
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.fulfillPaidOrder({
      orderId: 'order_1',
      providerPaymentId: 'payment_2',
      plan: PASS_30D,
      autoRenew: false,
      paymentMethod: null,
      now: NOW,
    });

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        currentPeriodEnd: new Date('2026-07-31T10:00:00.000Z'),
        autoRenew: false,
        nextChargeAt: null,
      }),
    });
  });

  it('does not silently disable renewal when repeat purchase unchecks the box', async () => {
    const harness = createDbHarness({
      access: {
        currentPeriodEnd: ACTIVE_END,
        autoRenew: true,
        planId: 'pass_7d',
        renewalPlanId: 'pass_7d',
        renewalAmountRub: 449,
      },
      activeCard: true,
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.fulfillPaidOrder({
      orderId: 'order_1',
      providerPaymentId: 'payment_2',
      plan: PASS_30D,
      autoRenew: false,
      paymentMethod: null,
      now: NOW,
    });

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        planId: 'pass_30d',
        autoRenew: true,
        renewalPlanId: 'pass_7d',
        renewalAmountRub: 449,
      }),
    });
  });

  it('binds minute pack lifetime to the active pass end', async () => {
    const harness = createDbHarness({
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: true },
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.fulfillPaidOrder({
      orderId: 'order_1',
      providerPaymentId: 'payment_pack',
      plan: {
        id: 'realtime_pack_60',
        type: 'minute_pack',
        durationDays: 30,
        realtimeVoiceMinutes: 60,
        priceRub: 890,
      },
      autoRenew: false,
      paymentMethod: null,
      now: NOW,
    });

    expect(harness.inserts).toContainEqual({
      table: schema.realtimeMinuteGrants,
      values: expect.objectContaining({
        sourceType: 'minute_pack',
        subscriptionId: 'access_existing',
        totalSeconds: 60 * 60,
        expiresAt: ACTIVE_END,
      }),
    });
    // Пакет не трогает саму запись доступа.
    expect(harness.updates).not.toContainEqual(
      expect.objectContaining({ table: schema.userSubscriptions })
    );
    expect(harness.inserts).not.toContainEqual(
      expect.objectContaining({ table: schema.userSubscriptions })
    );
  });

  it('does not fulfill the same order twice', async () => {
    const harness = createDbHarness({ orderFulfilled: true });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.fulfillPaidOrder({
        orderId: 'order_1',
        providerPaymentId: 'payment_1',
        plan: PASS_30D,
        autoRenew: true,
        paymentMethod: null,
        now: NOW,
      })
    ).resolves.toEqual({ fulfilled: false, alreadyFulfilled: true });
    expect(harness.inserts).toEqual([]);
    expect(harness.updates).toEqual([]);
  });

  it('claims a ready gift and grants a pass without auto-renewal', async () => {
    const harness = createDbHarness({ gift: true });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.claimReadyGiftsByEmail({
        recipientEmail: 'friend@example.com',
        beneficiaryUserId: 'recipient_1',
        plans: [PASS_30D],
        now: NOW,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'gift_1',
        status: 'claimed',
        claimedByUserId: 'recipient_1',
      }),
    ]);

    expect(harness.inserts).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        userId: 'recipient_1',
        planId: 'pass_30d',
        autoRenew: false,
        nextChargeAt: null,
        // Условия возможного продления хранятся, но само продление остаётся
        // выключенным до отдельного действия получателя.
        renewalPlanId: 'pass_30d',
        renewalAmountRub: 1190,
      }),
    });
    expect(harness.updates).toContainEqual({
      table: schema.giftEntitlements,
      values: expect.objectContaining({
        status: 'claimed',
        claimedByUserId: 'recipient_1',
        claimedAt: NOW,
      }),
    });
  });

  it('extends access with a gift without changing the active renewal agreement', async () => {
    const harness = createDbHarness({
      gift: true,
      giftPlanId: 'pass_180d',
      activeCard: true,
      access: {
        currentPeriodEnd: ACTIVE_END,
        autoRenew: true,
        planId: 'pass_7d',
        renewalPlanId: 'pass_7d',
        renewalAmountRub: 449,
      },
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.claimReadyGiftsByEmail({
      recipientEmail: 'friend@example.com',
      beneficiaryUserId: 'recipient_1',
      plans: [PASS_180D],
      now: NOW,
    });

    const subscriptionUpdate = harness.updates.find(
      (entry) => entry.table === schema.userSubscriptions
    );
    expect(subscriptionUpdate?.values).toEqual({
      currentPeriodEnd: new Date('2027-01-16T10:00:00.000Z'),
      nextChargeAt: new Date('2027-01-16T10:00:00.000Z'),
      renewalNoticeSentAt: null,
      updatedAt: NOW,
    });
    expect(harness.inserts).not.toContainEqual(
      expect.objectContaining({ table: schema.userPaymentMethods })
    );
    expect(harness.updates).not.toContainEqual(
      expect.objectContaining({ table: schema.userPaymentMethods })
    );
    expect(harness.selectedTables).not.toContain(schema.userPaymentMethods);
  });

  it('moves the next business charge to the gifted period end while a renewal stays unresolved', async () => {
    // Незавершённый renewal-order сверяется независимо (lease/renewalRetryAt
    // в metadata заказа); подарок переносит только следующую бизнес-попытку
    // на новый конец доступа и не трогает сам заказ.
    const retryAt = new Date('2026-07-01T11:00:00.000Z');
    const harness = createDbHarness({
      gift: true,
      unresolvedRenewal: true,
      access: {
        currentPeriodEnd: EXPIRED_END,
        nextChargeAt: retryAt,
        autoRenew: true,
      },
    });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.claimReadyGiftsByEmail({
      recipientEmail: 'friend@example.com',
      beneficiaryUserId: 'recipient_1',
      plans: [PASS_30D],
      now: NOW,
    });

    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        currentPeriodEnd: new Date('2026-07-31T10:00:00.000Z'),
        nextChargeAt: new Date('2026-07-31T10:00:00.000Z'),
      }),
    });
    expect(harness.updates).not.toContainEqual(
      expect.objectContaining({ table: schema.paymentOrders })
    );
  });
});

function createDbHarness(params?: {
  access?: {
    currentPeriodEnd: Date;
    nextChargeAt?: Date | null;
    autoRenew: boolean;
    planId?: string;
    renewalPlanId?: string;
    renewalAmountRub?: number;
    providerPaymentId?: string;
  };
  activeCard?: boolean;
  activePaymentMethodId?: string;
  unresolvedRenewal?: boolean;
  manualPassCheckout?: boolean;
  savedCardWithPayment?: boolean;
  gift?: boolean;
  giftPlanId?: string;
  orderFulfilled?: boolean;
}) {
  const orderRow = {
    id: 'order_1',
    userId: params?.gift ? 'purchaser_1' : 'user_1',
    planId: params?.giftPlanId ?? 'pass_30d',
    providerPaymentId: params?.gift ? 'payment_gift' : 'payment_1',
    fulfilledAt: params?.orderFulfilled ? NOW : null,
  };
  const accessRow = params?.access
    ? {
        id: 'access_existing',
        userId: params.gift ? 'recipient_1' : 'user_1',
        planId: params.access.planId ?? 'pass_30d',
        status: 'active',
        provider: 'yookassa',
        providerPaymentId:
          params.access.providerPaymentId ?? 'payment_first',
        currentPeriodEnd: params.access.currentPeriodEnd,
        autoRenew: params.access.autoRenew,
        nextChargeAt:
          params.access.nextChargeAt !== undefined
            ? params.access.nextChargeAt
            : params.access.autoRenew
              ? params.access.currentPeriodEnd
              : null,
        lastChargeAttemptAt: null,
        lastChargeError: null,
        chargeAttempts: 0,
        renewalPlanId: params.access.renewalPlanId ?? 'pass_30d',
        renewalAmountRub: params.access.renewalAmountRub ?? 1190,
        renewalNoticeSentAt: null,
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        updatedAt: new Date('2026-06-01T10:00:00.000Z'),
      }
    : null;
  const giftRow = {
    id: 'gift_1',
    orderId: 'order_1',
    purchaserUserId: 'purchaser_1',
    recipientEmail: 'friend@example.com',
    senderName: 'Николай',
    planId: params?.giftPlanId ?? 'pass_30d',
    status: 'ready',
    paidAt: NOW,
    claimExpiresAt: new Date('2027-01-01T10:00:00.000Z'),
    claimedAt: null,
    claimedByUserId: null,
    notificationStatus: 'pending',
    notificationAttempts: 0,
    notificationNextAttemptAt: NOW,
    notificationSentAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const selectedTables: unknown[] = [];
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const deletes: unknown[] = [];

  class SelectBuilder {
    private table: unknown;

    constructor(private readonly selection?: unknown) {}

    from(table: unknown) {
      this.table = table;
      selectedTables.push(table);
      return this;
    }

    where() {
      return this;
    }

    for() {
      return this;
    }

    then<TResult1 = unknown[], TResult2 = never>(
      onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(this.rows()).then(onfulfilled, onrejected);
    }

    private rows() {
      if (this.table === schema.users) return [{ id: 'user_1' }];
      if (this.table === schema.paymentOrders) {
        return this.selection
          ? params?.unresolvedRenewal || params?.manualPassCheckout
            ? [{ id: 'renewal_order_pending' }]
            : []
          : [orderRow];
      }
      if (this.table === schema.giftEntitlements) {
        return params?.gift ? [giftRow] : [];
      }
      if (this.table === schema.userPaymentMethods) {
        return params?.activeCard || params?.activePaymentMethodId
          ? [
              {
                id: 'method_1',
                providerPaymentMethodId:
                  params.activePaymentMethodId ?? 'pm_1',
              },
            ]
          : [];
      }
      if (this.table === schema.userSubscriptions) {
        return accessRow ? [accessRow] : [];
      }
      return [];
    }

    async limit() {
      return this.rows();
    }
  }

  class InsertBuilder {
    private valuesInput: unknown;

    constructor(private readonly table: unknown) {}

    values(values: unknown) {
      this.valuesInput = values;
      inserts.push({ table: this.table, values });
      return this;
    }

    onConflictDoNothing() {
      return this;
    }

    onConflictDoUpdate() {
      return this;
    }

    async returning() {
      return this.table === schema.userSubscriptions
        ? [{ id: 'access_new', ...toRecord(this.valuesInput) }]
        : [];
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(undefined).then(onfulfilled, onrejected);
    }
  }

  class UpdateBuilder {
    private valuesInput: unknown;

    constructor(private readonly table: unknown) {}

    set(values: unknown) {
      this.valuesInput = values;
      return this;
    }

    where() {
      updates.push({ table: this.table, values: this.valuesInput });
      return this;
    }

    async returning() {
      return [{ id: 'updated_1' }];
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(undefined).then(onfulfilled, onrejected);
    }
  }

  class DeleteBuilder {
    constructor(private readonly table: unknown) {}

    where() {
      deletes.push(this.table);
      return this;
    }

    async returning() {
      return [{ id: 'method_1' }];
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(undefined).then(onfulfilled, onrejected);
    }
  }

  const tx = {
    select: vi.fn((selection?: unknown) => new SelectBuilder(selection)),
    insert: vi.fn((table: unknown) => new InsertBuilder(table)),
    update: vi.fn((table: unknown) => new UpdateBuilder(table)),
    delete: vi.fn((table: unknown) => new DeleteBuilder(table)),
  };
  const db = {
    transaction: vi.fn(
      async (run: (transaction: typeof tx) => Promise<unknown>) =>
        await run(tx)
    ),
    update: vi.fn((table: unknown) => new UpdateBuilder(table)),
    delete: vi.fn((table: unknown) => new DeleteBuilder(table)),
  };

  return { db, deletes, inserts, selectedTables, updates };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@/server/infrastructure/db/client';
import { DrizzleBillingRepository } from './drizzleBillingRepository';

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

describe('DrizzleBillingRepository (модель доступа v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('не считает активную сессию использованным бесплатным интервью до готового отчёта', async () => {
    const selectRows = [
      [{ value: 0 }],
      [{ email: 'hello@mentala.app', telegramId: null }],
      [],
    ];
    const db = {
      select: vi.fn().mockImplementation(() => {
        const query = {
          limit: async () => selectRows.shift() ?? [],
        };
        const source = {
          where: () => query,
          innerJoin: () => ({ where: () => query }),
        };
        return { from: () => source };
      }),
    };
    database.getDb.mockReturnValue(db);
    const repository = new DrizzleBillingRepository();
    vi.spyOn(repository, 'countOwnerSessions').mockResolvedValue(1);

    await expect(
      repository.countOwnerFreeSessionsUsed({
        anonymousSessionId: 'anon_running',
        userId: 'user_1',
      })
    ).resolves.toBe(0);
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
      access: { currentPeriodEnd: ACTIVE_END, autoRenew: true },
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
      values: expect.objectContaining({ autoRenew: true }),
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
        // Условия продления зафиксированы — получатель может включить
        // автопродление сам по цене подарка.
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
});

function createDbHarness(params?: {
  access?: { currentPeriodEnd: Date; autoRenew: boolean };
  activeCard?: boolean;
  savedCardWithPayment?: boolean;
  gift?: boolean;
  orderFulfilled?: boolean;
}) {
  const orderRow = {
    id: 'order_1',
    userId: params?.gift ? 'purchaser_1' : 'user_1',
    planId: 'pass_30d',
    providerPaymentId: params?.gift ? 'payment_gift' : 'payment_1',
    fulfilledAt: params?.orderFulfilled ? NOW : null,
  };
  const accessRow = params?.access
    ? {
        id: 'access_existing',
        userId: 'user_1',
        planId: 'pass_30d',
        status: 'active',
        provider: 'yookassa',
        providerPaymentId: 'payment_first',
        currentPeriodEnd: params.access.currentPeriodEnd,
        autoRenew: params.access.autoRenew,
        nextChargeAt: params.access.autoRenew
          ? params.access.currentPeriodEnd
          : null,
        lastChargeAttemptAt: null,
        lastChargeError: null,
        chargeAttempts: 0,
        renewalPlanId: 'pass_30d',
        renewalAmountRub: 1190,
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
    planId: 'pass_30d',
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

  class SelectBuilder {
    private table: unknown;

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
      if (this.table === schema.paymentOrders) return [orderRow];
      if (this.table === schema.giftEntitlements) {
        return params?.gift ? [giftRow] : [];
      }
      if (this.table === schema.userPaymentMethods) {
        return params?.activeCard ? [{ id: 'method_1' }] : [];
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

    async where() {
      updates.push({ table: this.table, values: this.valuesInput });
      return [];
    }
  }

  const tx = {
    select: vi.fn(() => new SelectBuilder()),
    insert: vi.fn((table: unknown) => new InsertBuilder(table)),
    update: vi.fn((table: unknown) => new UpdateBuilder(table)),
  };
  const db = {
    transaction: vi.fn(
      async (run: (transaction: typeof tx) => Promise<unknown>) =>
        await run(tx)
    ),
    update: vi.fn((table: unknown) => new UpdateBuilder(table)),
  };

  return { db, inserts, selectedTables, updates };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

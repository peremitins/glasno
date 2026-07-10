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

describe('DrizzleBillingRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a separate entitlement row for every paid one-time plan', async () => {
    const harness = createDbHarness();
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.fulfillPaidOrder({
        orderId: 'order_second',
        providerPaymentId: 'payment_second',
        plan: {
          id: 'single_prep',
          kind: 'one_time',
          periodDays: 7,
          realtimeVoiceMinutes: 30,
        },
        now: NOW,
      })
    ).resolves.toEqual({ fulfilled: true, alreadyFulfilled: false });

    expect(harness.selectedTables).not.toContain(schema.userSubscriptions);
    expect(harness.inserts).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        userId: 'user_1',
        planId: 'single_prep',
        providerPaymentId: 'payment_second',
        currentPeriodEnd: new Date('2026-07-08T10:00:00.000Z'),
        autoRenew: false,
        nextChargeAt: null,
      }),
    });
    expect(harness.updates).not.toContainEqual(
      expect.objectContaining({ table: schema.userSubscriptions })
    );
    expect(harness.inserts).toContainEqual({
      table: schema.realtimeMinuteGrants,
      values: expect.objectContaining({
        subscriptionId: 'subscription_new',
        providerPaymentId: 'payment_second',
      }),
    });
  });

  it('keeps reusing and extending an active subscription entitlement', async () => {
    const harness = createDbHarness({ existingPlanId: 'pro_monthly' });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.fulfillPaidOrder({
      orderId: 'order_second',
      providerPaymentId: 'payment_second',
      plan: {
        id: 'pro_monthly',
        kind: 'subscription',
        periodDays: 30,
        realtimeVoiceMinutes: 60,
      },
      now: NOW,
    });

    expect(harness.selectedTables).toContain(schema.userSubscriptions);
    expect(harness.inserts).not.toContainEqual(
      expect.objectContaining({ table: schema.userSubscriptions })
    );
    expect(harness.updates).toContainEqual({
      table: schema.userSubscriptions,
      values: expect.objectContaining({
        currentPeriodEnd: new Date('2026-08-04T10:00:00.000Z'),
      }),
    });
    expect(harness.inserts).toContainEqual({
      table: schema.realtimeMinuteGrants,
      values: expect.objectContaining({
        subscriptionId: 'subscription_existing',
      }),
    });
    expect(harness.updates).toContainEqual({
      table: schema.realtimeMinuteGrants,
      values: expect.objectContaining({
        expiresAt: new Date('2026-08-04T10:00:00.000Z'),
      }),
    });
  });

  it('does not enable auto-renewal without explicit subscription ids', async () => {
    const harness = createDbHarness();
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await repository.setSubscriptionAutoRenew({
      userId: 'user_1',
      autoRenew: true,
      subscriptionIds: [],
      now: NOW,
    });

    expect(harness.updates).toEqual([]);
  });

  it('claims a ready gift for the verified email and grants access to the recipient', async () => {
    const harness = createDbHarness({ gift: true });
    database.getDb.mockReturnValue(harness.db);
    const repository = new DrizzleBillingRepository();

    await expect(
      repository.claimReadyGiftsByEmail({
        recipientEmail: 'friend@example.com',
        beneficiaryUserId: 'recipient_1',
        plans: [
          {
            id: 'pro_monthly',
            kind: 'subscription',
            periodDays: 30,
            realtimeVoiceMinutes: 60,
          },
        ],
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
        planId: 'pro_monthly',
        autoRenew: false,
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

function createDbHarness(params?: { existingPlanId?: string; gift?: boolean }) {
  const orderRow = {
    id: 'order_second',
    userId: 'user_1',
    planId: params?.gift ? 'pro_monthly' : 'single_prep',
    providerPaymentId: params?.gift ? 'payment_gift' : 'payment_second',
    fulfilledAt: null,
  };
  const existingOneTime = {
    id: 'subscription_existing',
    userId: 'user_1',
    planId: params?.existingPlanId ?? 'single_prep',
    status: 'active',
    provider: 'yookassa',
    providerPaymentId: 'payment_first',
    currentPeriodEnd: new Date('2026-07-05T10:00:00.000Z'),
    autoRenew: false,
    nextChargeAt: null,
    lastChargeAttemptAt: null,
    lastChargeError: null,
    createdAt: new Date('2026-06-28T10:00:00.000Z'),
    updatedAt: new Date('2026-06-28T10:00:00.000Z'),
  };
  const selectedTables: unknown[] = [];
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const giftRow = {
    id: 'gift_1',
    orderId: 'order_second',
    purchaserUserId: 'user_1',
    recipientEmail: 'friend@example.com',
    senderName: 'Николай',
    planId: 'pro_monthly',
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
      if (this.table === schema.paymentOrders) return [orderRow];
      if (this.table === schema.giftEntitlements) {
        return params?.gift ? [giftRow] : [];
      }
      return params?.existingPlanId ? [existingOneTime] : [];
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

    async returning() {
      return this.table === schema.userSubscriptions
        ? [{ id: 'subscription_new', ...toRecord(this.valuesInput) }]
        : [];
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

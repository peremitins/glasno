import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  or,
} from 'drizzle-orm';
import { getDb, schema } from '@/server/infrastructure/db/client';
import { calculateRealtimeVoiceUsageSeconds } from '@/server/application/realtime/realtimeVoiceUsage';
import { apiError } from '@/server/utils/errors';
import type {
  BillingOwner,
  BillingRepository,
  CreatePaymentOrderInput,
  GrantSubscriptionInput,
  PaymentOrderRecord,
  SubscriptionRecord,
  UpdatePaymentOrderInput,
} from '@/server/interface/billingRepository';

type PaymentOrderRow = typeof schema.paymentOrders.$inferSelect;
type SubscriptionRow = typeof schema.userSubscriptions.$inferSelect;

function ownerWhere(owner: BillingOwner) {
  if (owner.userId) {
    return or(
      eq(schema.interviewSessions.userId, owner.userId),
      eq(schema.interviewSessions.anonymousSessionId, owner.anonymousSessionId)
    );
  }
  return eq(schema.interviewSessions.anonymousSessionId, owner.anonymousSessionId);
}

function mapPaymentOrder(row: PaymentOrderRow): PaymentOrderRecord {
  return {
    id: row.id,
    userId: row.userId,
    planId: row.planId,
    provider: row.provider,
    providerPaymentId: row.providerPaymentId,
    status: row.status,
    amountRub: row.amountRub,
    currency: row.currency as 'RUB',
    confirmationUrl: row.confirmationUrl,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSubscription(row: SubscriptionRow): SubscriptionRecord {
  return {
    id: row.id,
    userId: row.userId,
    planId: row.planId,
    status: row.status,
    provider: row.provider,
    providerPaymentId: row.providerPaymentId,
    currentPeriodEnd: row.currentPeriodEnd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function requireRow<T>(row: T | undefined, entity: string): T {
  if (!row) {
    throw apiError('E_UNKNOWN', `База данных не вернула ${entity}`);
  }
  return row;
}

export class DrizzleBillingRepository implements BillingRepository {
  private readonly db = getDb();

  async countOwnerSessions(owner: BillingOwner): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.interviewSessions)
      .where(ownerWhere(owner));
    return Number(row?.value ?? 0);
  }

  async findActiveSubscriptionByUserId(
    userId: string,
    now = new Date()
  ): Promise<SubscriptionRecord | null> {
    const rows = await this.findActiveSubscriptionsByUserId(userId, now);
    return rows[0] ?? null;
  }

  async findActiveSubscriptionsByUserId(
    userId: string,
    now = new Date()
  ): Promise<SubscriptionRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.userSubscriptions)
      .where(
        and(
          eq(schema.userSubscriptions.userId, userId),
          eq(schema.userSubscriptions.status, 'active'),
          gt(schema.userSubscriptions.currentPeriodEnd, now)
        )
      );
    return rows.map(mapSubscription);
  }

  async countRealtimeVoiceUsageSeconds(
    owner: BillingOwner,
    params: {
      windowStart: Date;
      windowEnd: Date;
      idleTimeoutMs: number;
      now?: Date;
    }
  ): Promise<number> {
    const ownerClause = owner.userId
      ? or(
          eq(schema.realtimeVoiceSessions.userId, owner.userId),
          eq(
            schema.realtimeVoiceSessions.anonymousSessionId,
            owner.anonymousSessionId
          )
        )
      : eq(
          schema.realtimeVoiceSessions.anonymousSessionId,
          owner.anonymousSessionId
        );

    const rows = await this.db
      .select({
        startedAt: schema.realtimeVoiceSessions.startedAt,
        endedAt: schema.realtimeVoiceSessions.endedAt,
        lastActivityAt: schema.realtimeVoiceSessions.lastActivityAt,
      })
      .from(schema.realtimeVoiceSessions)
      .where(
        and(
          ownerClause,
          or(
            and(
              gte(schema.realtimeVoiceSessions.startedAt, params.windowStart),
              lte(schema.realtimeVoiceSessions.startedAt, params.windowEnd)
            ),
            and(
              lte(schema.realtimeVoiceSessions.startedAt, params.windowStart),
              or(
                isNull(schema.realtimeVoiceSessions.endedAt),
                gt(schema.realtimeVoiceSessions.endedAt, params.windowStart)
              )
            )
          )
        )
      );

    return calculateRealtimeVoiceUsageSeconds(rows, params);
  }

  async createPaymentOrder(
    input: CreatePaymentOrderInput
  ): Promise<PaymentOrderRecord> {
    const [row] = await this.db
      .insert(schema.paymentOrders)
      .values({
        userId: input.userId,
        planId: input.planId,
        amountRub: input.amountRub,
        currency: input.currency,
        metadata: input.metadata,
        status: 'pending',
      })
      .returning();
    return mapPaymentOrder(requireRow(row, 'payment_order'));
  }

  async findPaymentOrderById(id: string): Promise<PaymentOrderRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.paymentOrders)
      .where(eq(schema.paymentOrders.id, id))
      .limit(1);
    return row ? mapPaymentOrder(row) : null;
  }

  async findPaymentOrderByProviderPaymentId(
    providerPaymentId: string
  ): Promise<PaymentOrderRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.paymentOrders)
      .where(eq(schema.paymentOrders.providerPaymentId, providerPaymentId))
      .limit(1);
    return row ? mapPaymentOrder(row) : null;
  }

  async findLatestPaymentOrderByUserId(
    userId: string
  ): Promise<PaymentOrderRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.paymentOrders)
      .where(
        and(
          eq(schema.paymentOrders.userId, userId),
          eq(schema.paymentOrders.provider, 'yookassa'),
          inArray(schema.paymentOrders.status, [
            'pending',
            'waiting_for_capture',
            'succeeded',
          ])
        )
      )
      .orderBy(desc(schema.paymentOrders.createdAt))
      .limit(1);
    return row ? mapPaymentOrder(row) : null;
  }

  async updatePaymentOrder(
    input: UpdatePaymentOrderInput
  ): Promise<PaymentOrderRecord | null> {
    const [row] = await this.db
      .update(schema.paymentOrders)
      .set({
        providerPaymentId: input.providerPaymentId ?? undefined,
        status: input.status ?? undefined,
        confirmationUrl: input.confirmationUrl ?? undefined,
        metadata: input.metadata ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(schema.paymentOrders.id, input.id))
      .returning();
    return row ? mapPaymentOrder(row) : null;
  }

  async findSubscriptionByProviderPaymentId(
    providerPaymentId: string
  ): Promise<SubscriptionRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.userSubscriptions)
      .where(
        and(
          eq(schema.userSubscriptions.provider, 'yookassa'),
          eq(schema.userSubscriptions.providerPaymentId, providerPaymentId)
        )
      )
      .limit(1);
    return row ? mapSubscription(row) : null;
  }

  async grantSubscription(
    input: GrantSubscriptionInput
  ): Promise<SubscriptionRecord> {
    const [row] = await this.db
      .insert(schema.userSubscriptions)
      .values({
        userId: input.userId,
        planId: input.planId,
        status: 'active',
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        currentPeriodEnd: input.currentPeriodEnd,
      })
      .returning();
    return mapSubscription(requireRow(row, 'user_subscription'));
  }
}

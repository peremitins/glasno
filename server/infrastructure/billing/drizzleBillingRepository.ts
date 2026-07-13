import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { getDb, schema } from '@/server/infrastructure/db/client';
import { calculateRealtimeVoiceUsageSeconds } from '@/server/application/realtime/realtimeVoiceUsage';
import { apiError } from '@/server/utils/errors';
import type {
  BillingOwner,
  BillingRepository,
  CreatePaymentOrderInput,
  FulfillPaidOrderResult,
  FulfillPlanInput,
  GiftEntitlementRecord,
  GiftNotificationStatus,
  GiftPaymentOrderResult,
  PaidAccessRecord,
  PaymentMethodRecord,
  PaymentOrderRecord,
  RealtimeMinuteBalance,
  UpdatePaymentOrderInput,
} from '@/server/interface/billingRepository';

type PaymentOrderRow = typeof schema.paymentOrders.$inferSelect;
type AccessRow = typeof schema.userSubscriptions.$inferSelect;
type GiftEntitlementRow = typeof schema.giftEntitlements.$inferSelect;
type BillingTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>['transaction']>[0]
>[0];

interface GrantAccessPaymentMethod {
  providerPaymentMethodId: string;
  methodType?: string | null;
  title?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  cardExpiryMonth?: string | null;
  cardExpiryYear?: string | null;
}

function ownerWhere(owner: BillingOwner) {
  if (owner.userId) {
    return eq(schema.interviewSessions.userId, owner.userId);
  }
  return and(
    isNull(schema.interviewSessions.userId),
    eq(schema.interviewSessions.anonymousSessionId, owner.anonymousSessionId)
  );
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

function mapAccess(row: AccessRow): PaidAccessRecord {
  return {
    id: row.id,
    userId: row.userId,
    planId: row.planId,
    status: row.status,
    provider: row.provider,
    providerPaymentId: row.providerPaymentId,
    currentPeriodEnd: row.currentPeriodEnd,
    autoRenew: row.autoRenew,
    nextChargeAt: row.nextChargeAt,
    lastChargeAttemptAt: row.lastChargeAttemptAt,
    lastChargeError: row.lastChargeError,
    chargeAttempts: row.chargeAttempts,
    renewalPlanId: row.renewalPlanId,
    renewalAmountRub: row.renewalAmountRub,
    renewalNoticeSentAt: row.renewalNoticeSentAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapGiftEntitlement(row: GiftEntitlementRow): GiftEntitlementRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    purchaserUserId: row.purchaserUserId,
    recipientEmail: row.recipientEmail,
    senderName: row.senderName,
    planId: row.planId,
    status: row.status as GiftEntitlementRecord['status'],
    paidAt: row.paidAt,
    claimExpiresAt: row.claimExpiresAt,
    claimedAt: row.claimedAt,
    claimedByUserId: row.claimedByUserId,
    notificationStatus:
      row.notificationStatus as GiftNotificationStatus,
    notificationAttempts: row.notificationAttempts,
    notificationNextAttemptAt: row.notificationNextAttemptAt,
    notificationSentAt: row.notificationSentAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type PaymentMethodRow = typeof schema.userPaymentMethods.$inferSelect;

function mapPaymentMethod(row: PaymentMethodRow): PaymentMethodRecord {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    providerPaymentMethodId: row.providerPaymentMethodId,
    status: row.status,
    methodType: row.methodType,
    title: row.title,
    cardBrand: row.cardBrand,
    cardLast4: row.cardLast4,
    cardExpiryMonth: row.cardExpiryMonth,
    cardExpiryYear: row.cardExpiryYear,
    createdAt: row.createdAt,
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

  async countOwnerSessionsSince(
    owner: BillingOwner,
    since: Date
  ): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.interviewSessions)
      .where(
        and(ownerWhere(owner), gte(schema.interviewSessions.createdAt, since))
      );
    return Number(row?.value ?? 0);
  }

  async findUserEmail(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return row?.email ?? null;
  }

  // Запись доступа пользователя — одна на пользователя, включая истёкшую
  // (нужна для состояния «доступ закончился {дата}»).
  async findAccessByUserId(userId: string): Promise<PaidAccessRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.userSubscriptions)
      .where(eq(schema.userSubscriptions.userId, userId))
      .limit(1);
    return row ? mapAccess(row) : null;
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
      ? eq(schema.realtimeVoiceSessions.userId, owner.userId)
      : and(
          isNull(schema.realtimeVoiceSessions.userId),
          eq(
            schema.realtimeVoiceSessions.anonymousSessionId,
            owner.anonymousSessionId
          )
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

  async createGiftPaymentOrder(input: {
    purchaserUserId: string;
    recipientEmail: string;
    senderName: string;
    planId: string;
    amountRub: number;
    currency: 'RUB';
    metadata: Record<string, unknown>;
  }): Promise<GiftPaymentOrderResult> {
    return await this.db.transaction(async (tx) => {
      const [orderRow] = await tx
        .insert(schema.paymentOrders)
        .values({
          userId: input.purchaserUserId,
          planId: input.planId,
          amountRub: input.amountRub,
          currency: input.currency,
          metadata: input.metadata,
          status: 'pending',
        })
        .returning();
      const order = requireRow(orderRow, 'payment_order');
      const [giftRow] = await tx
        .insert(schema.giftEntitlements)
        .values({
          orderId: order.id,
          purchaserUserId: input.purchaserUserId,
          recipientEmail: input.recipientEmail,
          senderName: input.senderName,
          planId: input.planId,
          status: 'pending_payment',
          notificationStatus: 'pending',
        })
        .returning();
      return {
        order: mapPaymentOrder(order),
        gift: mapGiftEntitlement(requireRow(giftRow, 'gift_entitlement')),
      };
    });
  }

  async findGiftEntitlementByOrderId(
    orderId: string
  ): Promise<GiftEntitlementRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.giftEntitlements)
      .where(eq(schema.giftEntitlements.orderId, orderId))
      .limit(1);
    return row ? mapGiftEntitlement(row) : null;
  }

  async markGiftOrderPaid(params: {
    orderId: string;
    providerPaymentId: string;
    paidAt?: Date;
    claimExpiresAt: Date;
  }): Promise<GiftEntitlementRecord | null> {
    const paidAt = params.paidAt ?? new Date();
    return await this.db.transaction(async (tx) => {
      const [orderRow] = await tx
        .select()
        .from(schema.paymentOrders)
        .where(eq(schema.paymentOrders.id, params.orderId))
        .for('update')
        .limit(1);
      const [giftRow] = await tx
        .select()
        .from(schema.giftEntitlements)
        .where(eq(schema.giftEntitlements.orderId, params.orderId))
        .for('update')
        .limit(1);
      if (!orderRow || !giftRow) return null;
      if (giftRow.status === 'ready' || giftRow.status === 'claimed') {
        return mapGiftEntitlement(giftRow);
      }

      await tx
        .update(schema.paymentOrders)
        .set({
          providerPaymentId: params.providerPaymentId,
          status: 'succeeded',
          fulfilledAt: paidAt,
          updatedAt: paidAt,
        })
        .where(eq(schema.paymentOrders.id, params.orderId));
      const [updated] = await tx
        .update(schema.giftEntitlements)
        .set({
          status: 'ready',
          paidAt,
          claimExpiresAt: params.claimExpiresAt,
          notificationStatus: 'pending',
          notificationNextAttemptAt: paidAt,
          updatedAt: paidAt,
        })
        .where(eq(schema.giftEntitlements.id, giftRow.id))
        .returning();
      return updated ? mapGiftEntitlement(updated) : null;
    });
  }

  async cancelGiftOrder(params: {
    orderId: string;
    now?: Date;
  }): Promise<void> {
    const now = params.now ?? new Date();
    await this.db
      .update(schema.giftEntitlements)
      .set({
        status: 'canceled',
        notificationStatus: 'failed',
        notificationNextAttemptAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.giftEntitlements.orderId, params.orderId),
          eq(schema.giftEntitlements.status, 'pending_payment')
        )
      );
  }

  async claimReadyGiftsByEmail(params: {
    recipientEmail: string;
    beneficiaryUserId: string;
    plans: FulfillPlanInput[];
    now?: Date;
  }): Promise<GiftEntitlementRecord[]> {
    const now = params.now ?? new Date();
    const planById = new Map(params.plans.map((plan) => [plan.id, plan]));
    return await this.db.transaction(async (tx) => {
      const gifts = await tx
        .select()
        .from(schema.giftEntitlements)
        .where(
          and(
            eq(schema.giftEntitlements.recipientEmail, params.recipientEmail),
            eq(schema.giftEntitlements.status, 'ready')
          )
        )
        .for('update');
      const claimed: GiftEntitlementRecord[] = [];

      for (const gift of gifts) {
        if (gift.claimExpiresAt && gift.claimExpiresAt <= now) {
          await tx
            .update(schema.giftEntitlements)
            .set({ status: 'expired', updatedAt: now })
            .where(eq(schema.giftEntitlements.id, gift.id));
          continue;
        }
        const plan = planById.get(gift.planId);
        if (!plan || plan.type !== 'pass') continue;
        const [order] = await tx
          .select()
          .from(schema.paymentOrders)
          .where(eq(schema.paymentOrders.id, gift.orderId))
          .for('update')
          .limit(1);
        if (!order?.providerPaymentId) continue;

        // Подарок — всегда без автопродления (ТЗ тарифы v2): получатель
        // может включить его сам после привязки своей карты.
        const granted = await grantPaidAccess(tx, {
          beneficiaryUserId: params.beneficiaryUserId,
          providerPaymentId: order.providerPaymentId,
          plan,
          autoRenew: false,
          paymentMethod: null,
          now,
        });
        if (!granted) continue;

        await tx
          .update(schema.giftEntitlements)
          .set({
            status: 'claimed',
            claimedAt: now,
            claimedByUserId: params.beneficiaryUserId,
            updatedAt: now,
          })
          .where(eq(schema.giftEntitlements.id, gift.id));
        claimed.push(
          mapGiftEntitlement({
            ...gift,
            status: 'claimed',
            claimedAt: now,
            claimedByUserId: params.beneficiaryUserId,
            updatedAt: now,
          })
        );
      }
      return claimed;
    });
  }

  async listPaymentOrdersByUserId(params: {
    userId: string;
    cursor?: string | null;
    limit?: number;
  }) {
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const cursor = decodePaymentCursor(params.cursor);
    const rows = await this.db
      .select({
        order: schema.paymentOrders,
        gift: schema.giftEntitlements,
      })
      .from(schema.paymentOrders)
      .leftJoin(
        schema.giftEntitlements,
        eq(schema.giftEntitlements.orderId, schema.paymentOrders.id)
      )
      .where(
        and(
          eq(schema.paymentOrders.userId, params.userId),
          cursor
            ? or(
                lt(schema.paymentOrders.createdAt, cursor.createdAt),
                and(
                  eq(schema.paymentOrders.createdAt, cursor.createdAt),
                  lt(schema.paymentOrders.id, cursor.id)
                )
              )
            : undefined
        )
      )
      .orderBy(
        desc(schema.paymentOrders.createdAt),
        desc(schema.paymentOrders.id)
      )
      .limit(limit + 1);
    const visible = rows.slice(0, limit);
    const last = visible.at(-1)?.order;
    return {
      items: visible.map((row) => ({
        order: mapPaymentOrder(row.order),
        gift: row.gift ? mapGiftEntitlement(row.gift) : null,
      })),
      nextCursor:
        rows.length > limit && last
          ? encodePaymentCursor(last.createdAt, last.id)
          : null,
    };
  }

  async claimGiftNotifications(params: {
    now?: Date;
    limit?: number;
  }): Promise<GiftEntitlementRecord[]> {
    const now = params.now ?? new Date();
    return await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.giftEntitlements)
        .where(
          and(
            eq(schema.giftEntitlements.status, 'ready'),
            inArray(schema.giftEntitlements.notificationStatus, [
              'pending',
              'failed',
              'sending',
            ]),
            lt(schema.giftEntitlements.notificationAttempts, 5),
            or(
              isNull(schema.giftEntitlements.notificationNextAttemptAt),
              lte(schema.giftEntitlements.notificationNextAttemptAt, now)
            )
          )
        )
        .for('update', { skipLocked: true })
        .limit(params.limit ?? 20);
      const leaseUntil = new Date(now.getTime() + 10 * 60 * 1000);
      for (const row of rows) {
        await tx
          .update(schema.giftEntitlements)
          .set({
            notificationStatus: 'sending',
            notificationAttempts: row.notificationAttempts + 1,
            notificationNextAttemptAt: leaseUntil,
            updatedAt: now,
          })
          .where(eq(schema.giftEntitlements.id, row.id));
      }
      return rows.map((row) =>
        mapGiftEntitlement({
          ...row,
          notificationStatus: 'sending',
          notificationAttempts: row.notificationAttempts + 1,
          notificationNextAttemptAt: leaseUntil,
          updatedAt: now,
        })
      );
    });
  }

  async markGiftNotificationSent(params: {
    giftId: string;
    now?: Date;
  }): Promise<void> {
    const now = params.now ?? new Date();
    await this.db
      .update(schema.giftEntitlements)
      .set({
        notificationStatus: 'sent',
        notificationNextAttemptAt: null,
        notificationSentAt: now,
        updatedAt: now,
      })
      .where(eq(schema.giftEntitlements.id, params.giftId));
  }

  async markGiftNotificationFailed(params: {
    giftId: string;
    nextAttemptAt: Date | null;
    now?: Date;
  }): Promise<void> {
    const now = params.now ?? new Date();
    await this.db
      .update(schema.giftEntitlements)
      .set({
        notificationStatus: 'failed',
        notificationNextAttemptAt: params.nextAttemptAt,
        updatedAt: now,
      })
      .where(eq(schema.giftEntitlements.id, params.giftId));
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

  // Идемпотентная выдача доступа по оплаченному заказу. Ключевые свойства:
  // 1) заказ блокируется FOR UPDATE — параллельные вебхук и поллинг
  //    checkout-status не выдадут доступ дважды (fulfilled_at — флаг);
  // 2) покупка пропуска создаёт или продлевает единственную запись доступа
  //    пользователя (повторный вебхук не удвоит срок и минуты);
  // 3) минуты realtime voice начисляются грантом в леджер со сроком действия.
  async fulfillPaidOrder(params: {
    orderId: string;
    providerPaymentId: string;
    plan: FulfillPlanInput;
    autoRenew: boolean;
    paymentMethod?: {
      providerPaymentMethodId: string;
      methodType?: string | null;
      title?: string | null;
      cardBrand?: string | null;
      cardLast4?: string | null;
      cardExpiryMonth?: string | null;
      cardExpiryYear?: string | null;
    } | null;
    now?: Date;
  }): Promise<FulfillPaidOrderResult> {
    const now = params.now ?? new Date();
    return await this.db.transaction(async (tx) => {
      const [orderRow] = await tx
        .select()
        .from(schema.paymentOrders)
        .where(eq(schema.paymentOrders.id, params.orderId))
        .for('update')
        .limit(1);
      if (!orderRow) {
        return { fulfilled: false, alreadyFulfilled: false };
      }
      if (orderRow.fulfilledAt) {
        return { fulfilled: false, alreadyFulfilled: true };
      }

      const granted = await grantPaidAccess(tx, {
        beneficiaryUserId: orderRow.userId,
        providerPaymentId: params.providerPaymentId,
        plan: params.plan,
        autoRenew: params.autoRenew,
        paymentMethod: params.paymentMethod ?? null,
        now,
      });
      if (!granted) {
        return { fulfilled: false, alreadyFulfilled: true };
      }

      await tx
        .update(schema.paymentOrders)
        .set({ fulfilledAt: now, updatedAt: now })
        .where(eq(schema.paymentOrders.id, orderRow.id));

      return { fulfilled: true, alreadyFulfilled: false };
    });
  }

  async getRealtimeMinuteBalance(
    userId: string,
    now = new Date()
  ): Promise<RealtimeMinuteBalance> {
    const [row] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${schema.realtimeMinuteGrants.totalSeconds}), 0)`,
        consumed: sql<number>`coalesce(sum(${schema.realtimeMinuteGrants.consumedSeconds}), 0)`,
      })
      .from(schema.realtimeMinuteGrants)
      .where(
        and(
          eq(schema.realtimeMinuteGrants.userId, userId),
          gt(schema.realtimeMinuteGrants.expiresAt, now)
        )
      );
    const totalSeconds = Number(row?.total ?? 0);
    const consumedSeconds = Number(row?.consumed ?? 0);
    return {
      totalSeconds,
      consumedSeconds,
      remainingSeconds: Math.max(0, totalSeconds - consumedSeconds),
    };
  }

  async ensureTrialRealtimeGrant(params: {
    userId: string;
    totalSeconds: number;
    planId: string;
    expiresAt: Date;
  }): Promise<void> {
    // Идемпотентность: один триал-грант на пользователя. Guard по sourceType,
    // а не по planId, чтобы будущая смена planId не выдала повторный трайл.
    // Гонка «два одновременных getStatus у нового юзера» теоретически может
    // создать второй грант — цена ошибки мала (10 лишних минут единожды),
    // поэтому обходимся проверкой без отдельного unique-индекса.
    const [existing] = await this.db
      .select({ id: schema.realtimeMinuteGrants.id })
      .from(schema.realtimeMinuteGrants)
      .where(
        and(
          eq(schema.realtimeMinuteGrants.userId, params.userId),
          eq(schema.realtimeMinuteGrants.sourceType, 'trial')
        )
      )
      .limit(1);
    if (existing) return;
    await this.db.insert(schema.realtimeMinuteGrants).values({
      userId: params.userId,
      planId: params.planId,
      sourceType: 'trial',
      totalSeconds: params.totalSeconds,
      expiresAt: params.expiresAt,
    });
  }

  async debitRealtimeSeconds(params: {
    userId: string;
    seconds: number;
    realtimeSessionId?: string | null;
    now?: Date;
  }): Promise<void> {
    const now = params.now ?? new Date();
    let remaining = Math.max(0, Math.floor(params.seconds));
    if (remaining <= 0) return;

    await this.db.transaction(async (tx) => {
      // FIFO по сроку истечения: первыми тратим минуты, которые сгорят раньше.
      const grants = await tx
        .select()
        .from(schema.realtimeMinuteGrants)
        .where(
          and(
            eq(schema.realtimeMinuteGrants.userId, params.userId),
            gt(schema.realtimeMinuteGrants.expiresAt, now),
            lt(
              schema.realtimeMinuteGrants.consumedSeconds,
              schema.realtimeMinuteGrants.totalSeconds
            )
          )
        )
        .orderBy(schema.realtimeMinuteGrants.expiresAt)
        .for('update');

      for (const grant of grants) {
        if (remaining <= 0) break;
        const available = grant.totalSeconds - grant.consumedSeconds;
        const debit = Math.min(available, remaining);
        if (debit <= 0) continue;
        await tx
          .update(schema.realtimeMinuteGrants)
          .set({
            consumedSeconds: grant.consumedSeconds + debit,
            updatedAt: now,
          })
          .where(eq(schema.realtimeMinuteGrants.id, grant.id));
        await tx.insert(schema.realtimeMinuteDebits).values({
          userId: params.userId,
          grantId: grant.id,
          realtimeSessionId: params.realtimeSessionId ?? null,
          seconds: debit,
        });
        remaining -= debit;
      }
      // Если секунд не хватило (перерасход в границах hard-limit) — списали
      // всё доступное; отрицательного баланса не бывает.
    });
  }

  async findPaymentMethodByUserId(
    userId: string
  ): Promise<PaymentMethodRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.userPaymentMethods)
      .where(eq(schema.userPaymentMethods.userId, userId))
      .limit(1);
    return row ? mapPaymentMethod(row) : null;
  }

  async savePendingPaymentMethod(params: {
    userId: string;
    providerPaymentMethodId: string;
  }): Promise<void> {
    const now = new Date();
    await this.db
      .insert(schema.userPaymentMethods)
      .values({
        userId: params.userId,
        provider: 'yookassa',
        providerPaymentMethodId: params.providerPaymentMethodId,
        status: 'pending',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.userPaymentMethods.userId,
        set: {
          providerPaymentMethodId: params.providerPaymentMethodId,
          status: 'pending',
          methodType: null,
          title: null,
          cardBrand: null,
          cardLast4: null,
          cardExpiryMonth: null,
          cardExpiryYear: null,
          updatedAt: now,
        },
      });
  }

  async activatePaymentMethod(params: {
    userId: string;
    providerPaymentMethodId: string;
    methodType?: string | null;
    title?: string | null;
    cardBrand?: string | null;
    cardLast4?: string | null;
    cardExpiryMonth?: string | null;
    cardExpiryYear?: string | null;
  }): Promise<void> {
    await this.db
      .update(schema.userPaymentMethods)
      .set({
        providerPaymentMethodId: params.providerPaymentMethodId,
        status: 'active',
        methodType: params.methodType ?? null,
        title: params.title ?? null,
        cardBrand: params.cardBrand ?? null,
        cardLast4: params.cardLast4 ?? null,
        cardExpiryMonth: params.cardExpiryMonth ?? null,
        cardExpiryYear: params.cardExpiryYear ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.userPaymentMethods.userId, params.userId));
  }

  async deletePaymentMethodByUserId(userId: string): Promise<void> {
    await this.db
      .delete(schema.userPaymentMethods)
      .where(eq(schema.userPaymentMethods.userId, userId));
  }

  async setAccessAutoRenew(params: {
    userId: string;
    autoRenew: boolean;
    now?: Date;
  }): Promise<void> {
    const now = params.now ?? new Date();
    if (params.autoRenew) {
      // Включение — только на активном доступе: списание планируем на конец
      // периода, счётчик попыток и предуведомление сбрасываем.
      await this.db
        .update(schema.userSubscriptions)
        .set({
          autoRenew: true,
          nextChargeAt: sql`${schema.userSubscriptions.currentPeriodEnd}`,
          lastChargeError: null,
          chargeAttempts: 0,
          renewalNoticeSentAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.userSubscriptions.userId, params.userId),
            eq(schema.userSubscriptions.status, 'active'),
            gt(schema.userSubscriptions.currentPeriodEnd, now)
          )
        );
      return;
    }
    // Выключение — безусловное (376-ФЗ: отказ от списаний должен работать
    // всегда, в том числе для просроченной записи).
    await this.db
      .update(schema.userSubscriptions)
      .set({
        autoRenew: false,
        nextChargeAt: null,
        updatedAt: now,
      })
      .where(eq(schema.userSubscriptions.userId, params.userId));
  }

  // Доступы, которым пора автосписание: базовые eligibility-условия
  // зеркалят claimAccessForCharge.
  async listAccessDueForCharge(params: {
    userId?: string;
    now?: Date;
    retryAfterMs: number;
    maxAttempts: number;
    limit?: number;
  }): Promise<PaidAccessRecord[]> {
    const now = params.now ?? new Date();
    const retryCutoff = new Date(now.getTime() - params.retryAfterMs);
    const rows = await this.db
      .select()
      .from(schema.userSubscriptions)
      .where(
        and(
          params.userId
            ? eq(schema.userSubscriptions.userId, params.userId)
            : undefined,
          eq(schema.userSubscriptions.status, 'active'),
          eq(schema.userSubscriptions.autoRenew, true),
          lte(schema.userSubscriptions.nextChargeAt, now),
          lt(schema.userSubscriptions.chargeAttempts, params.maxAttempts),
          or(
            isNull(schema.userSubscriptions.lastChargeAttemptAt),
            lt(schema.userSubscriptions.lastChargeAttemptAt, retryCutoff)
          )
        )
      )
      .orderBy(schema.userSubscriptions.nextChargeAt)
      .limit(params.limit ?? 50);
    return rows.map(mapAccess);
  }

  // Claim-паттерн: атомарно помечает запись «в работе» и инкрементирует
  // счётчик попыток, чтобы два параллельных запроса не списали дважды.
  async claimAccessForCharge(params: {
    accessId: string;
    retryAfterMs: number;
    maxAttempts: number;
    now?: Date;
  }): Promise<PaidAccessRecord | null> {
    const now = params.now ?? new Date();
    const retryCutoff = new Date(now.getTime() - params.retryAfterMs);
    const [row] = await this.db
      .update(schema.userSubscriptions)
      .set({
        lastChargeAttemptAt: now,
        chargeAttempts: sql`${schema.userSubscriptions.chargeAttempts} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.userSubscriptions.id, params.accessId),
          eq(schema.userSubscriptions.status, 'active'),
          eq(schema.userSubscriptions.autoRenew, true),
          lte(schema.userSubscriptions.nextChargeAt, now),
          lt(schema.userSubscriptions.chargeAttempts, params.maxAttempts),
          or(
            isNull(schema.userSubscriptions.lastChargeAttemptAt),
            lt(schema.userSubscriptions.lastChargeAttemptAt, retryCutoff)
          )
        )
      )
      .returning();
    return row ? mapAccess(row) : null;
  }

  async recordAccessChargeError(params: {
    accessId: string;
    error: string;
    disableAutoRenew?: boolean;
    now?: Date;
  }): Promise<void> {
    const now = params.now ?? new Date();
    await this.db
      .update(schema.userSubscriptions)
      .set({
        lastChargeError: params.error.slice(0, 500),
        ...(params.disableAutoRenew
          ? { autoRenew: false, nextChargeAt: null }
          : {}),
        updatedAt: now,
      })
      .where(eq(schema.userSubscriptions.id, params.accessId));
  }

  async listAccessDueForRenewalNotice(params: {
    now?: Date;
    horizonMs: number;
    limit?: number;
  }): Promise<PaidAccessRecord[]> {
    const now = params.now ?? new Date();
    const horizon = new Date(now.getTime() + params.horizonMs);
    const rows = await this.db
      .select()
      .from(schema.userSubscriptions)
      .where(
        and(
          eq(schema.userSubscriptions.status, 'active'),
          eq(schema.userSubscriptions.autoRenew, true),
          isNull(schema.userSubscriptions.renewalNoticeSentAt),
          // Списание впереди и уже в пределах горизонта уведомления.
          gt(schema.userSubscriptions.nextChargeAt, now),
          lte(schema.userSubscriptions.nextChargeAt, horizon)
        )
      )
      .orderBy(schema.userSubscriptions.nextChargeAt)
      .limit(params.limit ?? 50);
    return rows.map(mapAccess);
  }

  // Идемпотентный claim предуведомления: renewal_notice_sent_at выставляется
  // атомарно, параллельный обход второй раз письмо не отправит.
  async claimRenewalNotice(params: {
    accessId: string;
    now?: Date;
  }): Promise<boolean> {
    const now = params.now ?? new Date();
    const rows = await this.db
      .update(schema.userSubscriptions)
      .set({ renewalNoticeSentAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.userSubscriptions.id, params.accessId),
          isNull(schema.userSubscriptions.renewalNoticeSentAt)
        )
      )
      .returning({ id: schema.userSubscriptions.id });
    return rows.length > 0;
  }
}

// Выдача оплаченного доступа внутри транзакции. Инварианты модели v2:
// - одна запись доступа на пользователя: активная продлевается от конца
//   периода, истёкшая начинает новый период от «сейчас»;
// - гранты одного пользователя сериализуются блокировкой его строки users —
//   гонка двух первых покупок не создаст две записи и не потеряет продление;
// - условия автопродления (план и цена) фиксируются в момент покупки;
// - все живые минуты (пакеты и минуты прежнего пропуска) продлеваются до
//   нового конца доступа: «минуты не сгорают, пока жив доступ».
async function grantPaidAccess(
  tx: BillingTransaction,
  params: {
    beneficiaryUserId: string;
    providerPaymentId: string;
    plan: FulfillPlanInput;
    autoRenew: boolean;
    paymentMethod: GrantAccessPaymentMethod | null;
    now: Date;
  }
): Promise<boolean> {
  const { beneficiaryUserId, plan, providerPaymentId, now } = params;

  await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, beneficiaryUserId))
    .for('update');

  if (plan.type === 'minute_pack') {
    // Пакет живёт, пока жив пропуск. Без активного пропуска (гонка с
    // истечением между checkout и оплатой) — не дольше собственного потолка.
    const [access] = await tx
      .select()
      .from(schema.userSubscriptions)
      .where(
        and(
          eq(schema.userSubscriptions.userId, beneficiaryUserId),
          eq(schema.userSubscriptions.status, 'active'),
          gt(schema.userSubscriptions.currentPeriodEnd, now)
        )
      )
      .limit(1);
    await tx.insert(schema.realtimeMinuteGrants).values({
      userId: beneficiaryUserId,
      planId: plan.id,
      sourceType: 'minute_pack',
      subscriptionId: access?.id ?? null,
      providerPaymentId,
      totalSeconds: plan.realtimeVoiceMinutes * 60,
      expiresAt: access?.currentPeriodEnd ?? addDaysTo(now, plan.durationDays),
    });
    return true;
  }

  const savedCard = params.paymentMethod;
  const [existing] = await tx
    .select()
    .from(schema.userSubscriptions)
    .where(eq(schema.userSubscriptions.userId, beneficiaryUserId))
    .for('update')
    .limit(1);

  // Автопродление реально включается, только если есть чем списывать:
  // карта пришла с этим платежом или уже была привязана (оплата СБП и т.п.
  // без сохранённого метода оставляет покупку разовой).
  let hasChargeableMethod = Boolean(savedCard);
  if (!hasChargeableMethod) {
    const [method] = await tx
      .select({ id: schema.userPaymentMethods.id })
      .from(schema.userPaymentMethods)
      .where(
        and(
          eq(schema.userPaymentMethods.userId, beneficiaryUserId),
          eq(schema.userPaymentMethods.status, 'active')
        )
      )
      .limit(1);
    hasChargeableMethod = Boolean(method);
  }

  const existingActive = Boolean(
    existing &&
      existing.status === 'active' &&
      existing.currentPeriodEnd > now
  );
  // Повторная покупка со снятой галочкой не выключает уже включённое
  // автопродление — выключение только явным действием пользователя.
  const autoRenewOn =
    (params.autoRenew && hasChargeableMethod) ||
    (existingActive && Boolean(existing!.autoRenew));
  const periodStart = existingActive ? existing!.currentPeriodEnd : now;
  const periodEnd = addDaysTo(periodStart, plan.durationDays);

  let accessId: string;
  if (existing) {
    await tx
      .update(schema.userSubscriptions)
      .set({
        planId: plan.id,
        status: 'active',
        provider: 'yookassa',
        providerPaymentId,
        currentPeriodEnd: periodEnd,
        autoRenew: autoRenewOn,
        nextChargeAt: autoRenewOn ? periodEnd : null,
        lastChargeError: null,
        chargeAttempts: 0,
        renewalPlanId: plan.id,
        renewalAmountRub: plan.priceRub,
        renewalNoticeSentAt: null,
        updatedAt: now,
      })
      .where(eq(schema.userSubscriptions.id, existing.id));
    accessId = existing.id;
  } else {
    const [inserted] = await tx
      .insert(schema.userSubscriptions)
      .values({
        userId: beneficiaryUserId,
        planId: plan.id,
        status: 'active',
        provider: 'yookassa',
        providerPaymentId,
        currentPeriodEnd: periodEnd,
        autoRenew: autoRenewOn,
        nextChargeAt: autoRenewOn ? periodEnd : null,
        renewalPlanId: plan.id,
        renewalAmountRub: plan.priceRub,
      })
      .onConflictDoNothing({
        target: schema.userSubscriptions.providerPaymentId,
      })
      .returning();
    if (!inserted) return false;
    accessId = inserted.id;
  }

  // Все живые минуты доезжают до нового конца доступа.
  await tx
    .update(schema.realtimeMinuteGrants)
    .set({ expiresAt: periodEnd, updatedAt: now })
    .where(
      and(
        eq(schema.realtimeMinuteGrants.userId, beneficiaryUserId),
        gt(schema.realtimeMinuteGrants.expiresAt, now),
        lt(schema.realtimeMinuteGrants.expiresAt, periodEnd)
      )
    );

  if (savedCard) {
    await tx
      .insert(schema.userPaymentMethods)
      .values({
        userId: beneficiaryUserId,
        provider: 'yookassa',
        providerPaymentMethodId: savedCard.providerPaymentMethodId,
        status: 'active',
        methodType: savedCard.methodType ?? null,
        title: savedCard.title ?? null,
        cardBrand: savedCard.cardBrand ?? null,
        cardLast4: savedCard.cardLast4 ?? null,
        cardExpiryMonth: savedCard.cardExpiryMonth ?? null,
        cardExpiryYear: savedCard.cardExpiryYear ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.userPaymentMethods.userId,
        set: {
          providerPaymentMethodId: savedCard.providerPaymentMethodId,
          status: 'active',
          methodType: savedCard.methodType ?? null,
          title: savedCard.title ?? null,
          cardBrand: savedCard.cardBrand ?? null,
          cardLast4: savedCard.cardLast4 ?? null,
          cardExpiryMonth: savedCard.cardExpiryMonth ?? null,
          cardExpiryYear: savedCard.cardExpiryYear ?? null,
          updatedAt: now,
        },
      });
  }

  if (plan.realtimeVoiceMinutes > 0) {
    await tx.insert(schema.realtimeMinuteGrants).values({
      userId: beneficiaryUserId,
      planId: plan.id,
      sourceType: 'pass',
      subscriptionId: accessId,
      providerPaymentId,
      totalSeconds: plan.realtimeVoiceMinutes * 60,
      expiresAt: periodEnd,
    });
  }
  return true;
}

function addDaysTo(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function encodePaymentCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

function decodePaymentCursor(value: string | null | undefined): {
  createdAt: Date;
  id: string;
} | null {
  if (!value) return null;
  try {
    const [createdAtValue, id] = Buffer.from(value, 'base64url')
      .toString('utf8')
      .split('|');
    const createdAt = new Date(createdAtValue || '');
    if (!id || Number.isNaN(createdAt.getTime())) throw new Error('invalid');
    return { createdAt, id };
  } catch {
    throw apiError('E_VALIDATION', 'Некорректный cursor истории платежей');
  }
}

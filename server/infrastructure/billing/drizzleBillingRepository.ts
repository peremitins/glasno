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
  GrantSubscriptionInput,
  PaymentMethodRecord,
  PaymentOrderRecord,
  RealtimeMinuteBalance,
  SubscriptionRecord,
  UpdatePaymentOrderInput,
} from '@/server/interface/billingRepository';

type PaymentOrderRow = typeof schema.paymentOrders.$inferSelect;
type SubscriptionRow = typeof schema.userSubscriptions.$inferSelect;

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

function mapSubscription(row: SubscriptionRow): SubscriptionRecord {
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

  // Идемпотентная выдача доступа по оплаченному заказу. Ключевые свойства:
  // 1) заказ блокируется FOR UPDATE — параллельные вебхук и поллинг
  //    checkout-status не выдадут доступ дважды (fulfilled_at — флаг);
  // 2) повторная покупка subscription продлевает период, а каждый one_time
  //    платёж создаёт отдельный entitlement на включённое интервью;
  // 3) минуты realtime voice начисляются грантом в леджер со сроком действия.
  async fulfillPaidOrder(params: {
    orderId: string;
    providerPaymentId: string;
    plan: FulfillPlanInput;
    paymentMethod?: {
      providerPaymentMethodId: string;
      methodType?: string | null;
      title?: string | null;
      cardBrand?: string | null;
      cardLast4?: string | null;
      cardExpiryMonth?: string | null;
      cardExpiryYear?: string | null;
    } | null;
    maxExpiresAt?: Date | null;
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

      const plan = params.plan;
      const savedCard =
        plan.kind === 'subscription' ? (params.paymentMethod ?? null) : null;
      let subscriptionId: string | null = null;
      let minutesExpireAt = addDaysTo(now, plan.periodDays);
      // Кап для addon-пакетов: минуты не живут дольше активного доступа
      // покупателя. Кап в прошлом игнорируем — иначе грант родится мёртвым.
      if (
        plan.kind === 'addon' &&
        params.maxExpiresAt &&
        params.maxExpiresAt > now &&
        params.maxExpiresAt < minutesExpireAt
      ) {
        minutesExpireAt = params.maxExpiresAt;
      }

      let existing: SubscriptionRow | undefined;
      if (plan.kind === 'subscription') {
        const rows = await tx
          .select()
          .from(schema.userSubscriptions)
          .where(
            and(
              eq(schema.userSubscriptions.userId, orderRow.userId),
              eq(schema.userSubscriptions.planId, plan.id),
              eq(schema.userSubscriptions.status, 'active'),
              gt(schema.userSubscriptions.currentPeriodEnd, now)
            )
          )
          .for('update')
          .limit(1);
        existing = rows[0];
      }

      if (existing) {
        // Продление: новый период добавляется к концу текущего.
        const base =
          existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
        const nextPeriodEnd = addDaysTo(base, plan.periodDays);
        await tx
          .update(schema.userSubscriptions)
          .set({
            currentPeriodEnd: nextPeriodEnd,
            updatedAt: now,
            ...(savedCard || existing.autoRenew
              ? {
                  autoRenew: true,
                  nextChargeAt: nextPeriodEnd,
                  lastChargeError: null,
                }
              : {}),
          })
          .where(eq(schema.userSubscriptions.id, existing.id));
        subscriptionId = existing.id;
        minutesExpireAt = nextPeriodEnd;
      } else if (plan.kind === 'subscription' || plan.kind === 'one_time') {
        const periodEnd = addDaysTo(now, plan.periodDays);
        const [inserted] = await tx
          .insert(schema.userSubscriptions)
          .values({
            userId: orderRow.userId,
            planId: plan.id,
            status: 'active',
            provider: 'yookassa',
            providerPaymentId: params.providerPaymentId,
            currentPeriodEnd: periodEnd,
            autoRenew: Boolean(savedCard),
            nextChargeAt: savedCard ? periodEnd : null,
          })
          .onConflictDoNothing({
            target: schema.userSubscriptions.providerPaymentId,
          })
          .returning();
        if (!inserted) {
          // Уникальный индекс сработал: этот платёж уже обслужен.
          return { fulfilled: false, alreadyFulfilled: true };
        }
        subscriptionId = inserted.id;
        minutesExpireAt = periodEnd;
      }

      // Карта, сохранённая YooKassa при оплате подписки: upsert для
      // автосписаний (одна карта на пользователя, по образцу Mentala).
      if (savedCard) {
        await tx
          .insert(schema.userPaymentMethods)
          .values({
            userId: orderRow.userId,
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
          userId: orderRow.userId,
          planId: plan.id,
          sourceType: plan.kind,
          subscriptionId,
          providerPaymentId: params.providerPaymentId,
          totalSeconds: plan.realtimeVoiceMinutes * 60,
          expiresAt: minutesExpireAt,
        });
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

  async setSubscriptionAutoRenew(params: {
    userId: string;
    autoRenew: boolean;
    subscriptionIds?: string[];
    now?: Date;
  }): Promise<void> {
    const now = params.now ?? new Date();
    const subscriptionIds = params.subscriptionIds ?? [];
    if (params.autoRenew && subscriptionIds.length === 0) return;
    await this.db
      .update(schema.userSubscriptions)
      .set({
        autoRenew: params.autoRenew,
        // При включении списание планируем на конец периода; при
        // выключении план списания снимаем.
        nextChargeAt: params.autoRenew
          ? sql`${schema.userSubscriptions.currentPeriodEnd}`
          : null,
        lastChargeError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.userSubscriptions.userId, params.userId),
          params.autoRenew
            ? inArray(schema.userSubscriptions.id, subscriptionIds)
            : undefined,
          eq(schema.userSubscriptions.status, 'active'),
          gt(schema.userSubscriptions.currentPeriodEnd, now)
        )
      );
  }

  // Подписки, которым пора автосписание: базовые eligibility-условия
  // зеркалят claimSubscriptionForCharge, а userId/planIds сужают кандидатов.
  async listSubscriptionsDueForCharge(params: {
    userId?: string;
    planIds: string[];
    now?: Date;
    retryAfterMs: number;
    limit?: number;
  }): Promise<SubscriptionRecord[]> {
    if (params.planIds.length === 0) return [];
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
          inArray(schema.userSubscriptions.planId, params.planIds),
          eq(schema.userSubscriptions.status, 'active'),
          eq(schema.userSubscriptions.autoRenew, true),
          lte(schema.userSubscriptions.nextChargeAt, now),
          or(
            isNull(schema.userSubscriptions.lastChargeAttemptAt),
            lt(schema.userSubscriptions.lastChargeAttemptAt, retryCutoff)
          )
        )
      )
      .orderBy(schema.userSubscriptions.nextChargeAt)
      .limit(params.limit ?? 50);
    return rows.map(mapSubscription);
  }

  // Claim-паттерн: атомарно помечает подписку «в работе», чтобы два
  // параллельных запроса не запустили двойное списание.
  async claimSubscriptionForCharge(params: {
    subscriptionId: string;
    retryAfterMs: number;
    now?: Date;
  }): Promise<SubscriptionRecord | null> {
    const now = params.now ?? new Date();
    const retryCutoff = new Date(now.getTime() - params.retryAfterMs);
    const [row] = await this.db
      .update(schema.userSubscriptions)
      .set({ lastChargeAttemptAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.userSubscriptions.id, params.subscriptionId),
          eq(schema.userSubscriptions.status, 'active'),
          eq(schema.userSubscriptions.autoRenew, true),
          lte(schema.userSubscriptions.nextChargeAt, now),
          or(
            isNull(schema.userSubscriptions.lastChargeAttemptAt),
            lt(schema.userSubscriptions.lastChargeAttemptAt, retryCutoff)
          )
        )
      )
      .returning();
    return row ? mapSubscription(row) : null;
  }

  async recordSubscriptionChargeError(params: {
    subscriptionId: string;
    error: string;
    now?: Date;
  }): Promise<void> {
    const now = params.now ?? new Date();
    await this.db
      .update(schema.userSubscriptions)
      .set({ lastChargeError: params.error.slice(0, 500), updatedAt: now })
      .where(eq(schema.userSubscriptions.id, params.subscriptionId));
  }
}

function addDaysTo(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

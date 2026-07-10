import type { BillingStatusResponse } from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type {
  BillingOwner,
  BillingRepository,
  PaymentMethodRecord,
  SubscriptionRecord,
} from '@/server/interface/billingRepository';
import {
  ALL_SESSION_GOALS,
  BILLING_PLANS,
  FREE_ALLOWED_SESSION_GOALS,
  FREE_SESSIONS_LIMIT,
  getBillingPlan,
  type BillingPlanConfig,
  type SessionGoalAccess,
} from './plans';

interface ActivePlan {
  subscription: SubscriptionRecord;
  plan: BillingPlanConfig;
}

export class BillingAccessService {
  constructor(
    private readonly deps: {
      repository: Pick<
        BillingRepository,
        | 'countOwnerSessions'
        | 'countOwnerSessionsSince'
        | 'findActiveSubscriptionsByUserId'
        | 'getRealtimeMinuteBalance'
        | 'findPaymentMethodByUserId'
        | 'findUserEmail'
        | 'claimReadyGiftsByEmail'
      >;
    }
  ) {}

  async getStatus(owner: BillingOwner): Promise<BillingStatusResponse> {
    if (owner.userId) {
      const email = await this.deps.repository.findUserEmail(owner.userId);
      if (email) {
        await this.deps.repository.claimReadyGiftsByEmail({
          recipientEmail: email.trim().toLowerCase(),
          beneficiaryUserId: owner.userId,
          plans: BILLING_PLANS.filter(
            (plan) => plan.priceRub > 0 && plan.kind !== 'addon'
          ).map((plan) => ({
            id: plan.id,
            kind: plan.kind,
            periodDays: plan.periodDays,
            realtimeVoiceMinutes: plan.realtimeVoiceMinutes,
          })),
        });
      }
    }

    // Admin — безлимит, лимиты не считаем. Но реальный billing-блок
    // (карта, автопродление) возвращаем: админ должен видеть и тестировать
    // привязку карты и автосписания как обычный пользователь.
    if (owner.role === 'admin') {
      const [subscriptions, paymentMethod] = await Promise.all([
        owner.userId
          ? this.deps.repository.findActiveSubscriptionsByUserId(owner.userId)
          : Promise.resolve([]),
        owner.userId
          ? this.deps.repository.findPaymentMethodByUserId(owner.userId)
          : Promise.resolve(null),
      ]);
      const plans = toActivePlans(subscriptions);
      const subscriptionPlans = plans.filter(
        (item) => item.plan.kind === 'subscription'
      );
      const primaryPlan =
        [...plans].sort(
          (a, b) => b.plan.priority - a.plan.priority
        )[0] ?? null;
      return {
        freeSessionsLimit: FREE_SESSIONS_LIMIT,
        freeSessionsUsed: 0,
        canCreateInterview: true,
        allowedSessionGoals: ALL_SESSION_GOALS,
        paidInterviewsRemaining: null,
        hasActiveSubscription: subscriptionPlans.length > 0,
        unlimited: true,
        activePlanId: primaryPlan?.plan.id ?? null,
        activePlanName: primaryPlan?.plan.name ?? null,
        subscriptionExpiresAt:
          primaryPlan?.subscription.currentPeriodEnd.toISOString() ?? null,
        billing: buildBillingInfo({
          userId: owner.userId,
          subscriptionPlans,
          paymentMethod,
        }),
        needsAuthForCheckout: !owner.userId,
        realtimeVoice: {
          includedMinutes: 999_999,
          usedMinutes: 0,
          remainingMinutes: 999_999,
          canBuyMore: true,
        },
      };
    }

    const [freeSessionsUsed, subscriptions, minuteBalance, paymentMethod] =
      await Promise.all([
        this.deps.repository.countOwnerSessions(owner),
        owner.userId
          ? this.deps.repository.findActiveSubscriptionsByUserId(owner.userId)
          : Promise.resolve([]),
        owner.userId
          ? this.deps.repository.getRealtimeMinuteBalance(owner.userId)
          : Promise.resolve({
              totalSeconds: 0,
              consumedSeconds: 0,
              remainingSeconds: 0,
            }),
        owner.userId
          ? this.deps.repository.findPaymentMethodByUserId(owner.userId)
          : Promise.resolve(null),
      ]);

    const plans = toActivePlans(subscriptions);
    const subscriptionPlans = plans.filter(
      (item) => item.plan.kind === 'subscription'
    );
    const oneTimePlans = plans.filter((item) => item.plan.kind === 'one_time');
    const hasActiveSubscription = subscriptionPlans.length > 0;

    // «Основной» тариф — с наибольшим приоритетом (Career Pack > Pro > разовый).
    const primaryPlan =
      [...subscriptionPlans, ...oneTimePlans].sort(
        (a, b) => b.plan.priority - a.plan.priority
      )[0] ?? null;

    // Разовый доступ: считаем интервью, созданные после его покупки.
    let paidInterviewsRemaining: number | null = null;
    if (!hasActiveSubscription && oneTimePlans.length > 0) {
      const earliestGrantedAt = oneTimePlans.reduce(
        (min, item) =>
          item.subscription.createdAt < min ? item.subscription.createdAt : min,
        oneTimePlans[0]!.subscription.createdAt
      );
      const includedInterviews = oneTimePlans.reduce(
        (sum, item) => sum + (item.plan.includedInterviews ?? 0),
        0
      );
      const usedSince = await this.deps.repository.countOwnerSessionsSince(
        owner,
        earliestGrantedAt
      );
      paidInterviewsRemaining = Math.max(0, includedInterviews - usedSince);
    }

    const canCreateInterview =
      hasActiveSubscription ||
      (paidInterviewsRemaining ?? 0) > 0 ||
      freeSessionsUsed < FREE_SESSIONS_LIMIT;

    const allowedSessionGoals: SessionGoalAccess[] =
      hasActiveSubscription || (paidInterviewsRemaining ?? 0) > 0
        ? ALL_SESSION_GOALS
        : FREE_ALLOWED_SESSION_GOALS;

    const includedMinutes = Math.floor(minuteBalance.totalSeconds / 60);
    const remainingMinutes = Math.floor(minuteBalance.remainingSeconds / 60);
    const usedMinutes = Math.max(0, includedMinutes - remainingMinutes);

    const billing = buildBillingInfo({
      userId: owner.userId,
      subscriptionPlans,
      paymentMethod,
    });

    return {
      freeSessionsLimit: FREE_SESSIONS_LIMIT,
      freeSessionsUsed,
      canCreateInterview,
      allowedSessionGoals,
      paidInterviewsRemaining,
      hasActiveSubscription,
      unlimited: false,
      activePlanId: primaryPlan?.plan.id ?? null,
      activePlanName: primaryPlan?.plan.name ?? null,
      subscriptionExpiresAt:
        primaryPlan?.subscription.currentPeriodEnd.toISOString() ?? null,
      billing,
      needsAuthForCheckout: !owner.userId,
      realtimeVoice: {
        includedMinutes,
        usedMinutes,
        remainingMinutes,
        // Пакеты минут продаются при любом активном платном тарифе
        // (подписка или разовый доступ).
        canBuyMore: Boolean(owner.userId) && plans.length > 0,
      },
    };
  }

  async assertCanCreateInterview(
    owner: BillingOwner,
    params?: { sessionGoal?: SessionGoalAccess }
  ): Promise<BillingStatusResponse> {
    const status = await this.getStatus(owner);
    if (!status.canCreateInterview) {
      throw apiError(
        'E_FORBIDDEN',
        'Бесплатный лимит исчерпан. Выберите тариф, чтобы продолжить тренировки.',
        status
      );
    }
    const sessionGoal = params?.sessionGoal;
    if (
      sessionGoal &&
      !status.unlimited &&
      !status.allowedSessionGoals.includes(sessionGoal)
    ) {
      throw apiError(
        'E_FORBIDDEN',
        'Бесплатно доступно быстрое интервью. Стандартный и глубокий форматы — на платных тарифах.',
        status
      );
    }
    return status;
  }
}

function toActivePlans(subscriptions: SubscriptionRecord[]): ActivePlan[] {
  return subscriptions.map((subscription) => ({
    subscription,
    plan: getBillingPlan(subscription.planId),
  }));
}

// Информация об автопродлении (по образцу Mentala): когда и сколько
// спишется, с какой карты, была ли ошибка последнего списания.
// Блок возвращается ЛЮБОМУ авторизованному пользователю — UI показывает
// «Привязать карту», когда карты нет.
function buildBillingInfo(params: {
  userId: string | null | undefined;
  subscriptionPlans: ActivePlan[];
  paymentMethod: PaymentMethodRecord | null;
}): BillingStatusResponse['billing'] {
  if (!params.userId) return null;
  const renewalSubscription = params.subscriptionPlans.find(
    (item) => item.subscription.autoRenew
  );
  const activePaymentMethod =
    params.paymentMethod?.status === 'active' ? params.paymentMethod : null;
  return {
    autoRenew: Boolean(renewalSubscription),
    nextChargeAt:
      renewalSubscription?.subscription.nextChargeAt?.toISOString() ?? null,
    nextChargeAmountRub: renewalSubscription
      ? renewalSubscription.plan.priceRub
      : null,
    lastChargeError: renewalSubscription?.subscription.lastChargeError ?? null,
    paymentMethod: activePaymentMethod
      ? {
          title: activePaymentMethod.title,
          cardBrand: activePaymentMethod.cardBrand,
          cardLast4: activePaymentMethod.cardLast4,
          cardExpiryMonth: activePaymentMethod.cardExpiryMonth,
          cardExpiryYear: activePaymentMethod.cardExpiryYear,
        }
      : null,
  };
}

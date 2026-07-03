import type { BillingStatusResponse } from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type {
  BillingOwner,
  BillingRepository,
  SubscriptionRecord,
} from '@/server/interface/billingRepository';
import {
  ALL_SESSION_GOALS,
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
      >;
    }
  ) {}

  async getStatus(owner: BillingOwner): Promise<BillingStatusResponse> {
    // Admin — безлимит, лимиты не считаем.
    if (owner.role === 'admin') {
      return {
        freeSessionsLimit: FREE_SESSIONS_LIMIT,
        freeSessionsUsed: 0,
        canCreateInterview: true,
        allowedSessionGoals: ALL_SESSION_GOALS,
        paidInterviewsRemaining: null,
        hasActiveSubscription: false,
        unlimited: true,
        activePlanId: null,
        activePlanName: null,
        subscriptionExpiresAt: null,
        billing: null,
        needsAuthForCheckout: false,
        realtimeVoice: {
          includedMinutes: 999_999,
          usedMinutes: 0,
          remainingMinutes: 999_999,
          canBuyMore: false,
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

    const plans: ActivePlan[] = subscriptions.map((subscription) => ({
      subscription,
      plan: getBillingPlan(subscription.planId),
    }));
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

    // Информация об автопродлении (по образцу Mentala): когда и сколько
    // спишется, с какой карты, была ли ошибка последнего списания.
    // Блок возвращается ЛЮБОМУ авторизованному пользователю — UI показывает
    // «Привязать карту», когда карты нет.
    const renewalSubscription = subscriptionPlans.find(
      (item) => item.subscription.autoRenew
    );
    const activePaymentMethod =
      paymentMethod?.status === 'active' ? paymentMethod : null;
    const billing = owner.userId
      ? {
          autoRenew: Boolean(renewalSubscription),
          nextChargeAt:
            renewalSubscription?.subscription.nextChargeAt?.toISOString() ??
            null,
          nextChargeAmountRub: renewalSubscription
            ? renewalSubscription.plan.priceRub
            : null,
          lastChargeError:
            renewalSubscription?.subscription.lastChargeError ?? null,
          paymentMethod: activePaymentMethod
            ? {
                title: activePaymentMethod.title,
                cardBrand: activePaymentMethod.cardBrand,
                cardLast4: activePaymentMethod.cardLast4,
                cardExpiryMonth: activePaymentMethod.cardExpiryMonth,
                cardExpiryYear: activePaymentMethod.cardExpiryYear,
              }
            : null,
        }
      : null;

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
        // Пакеты минут продаются только при активной подписке.
        canBuyMore: Boolean(owner.userId) && hasActiveSubscription,
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

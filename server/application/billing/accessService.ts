import type { BillingStatusResponse } from '@/shared/dto';
import { REALTIME_VOICE_IDLE_TIMEOUT_SECONDS } from '@/server/application/realtime/realtimeVoiceLimits';
import { apiError } from '@/server/utils/errors';
import type {
  BillingOwner,
  BillingRepository,
} from '@/server/interface/billingRepository';
import { FREE_SESSIONS_LIMIT, getBillingPlan } from './plans';

export class BillingAccessService {
  constructor(
    private readonly deps: {
      repository: Pick<
        BillingRepository,
        | 'countOwnerSessions'
        | 'findActiveSubscriptionsByUserId'
        | 'countRealtimeVoiceUsageSeconds'
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
        hasActiveSubscription: false,
        unlimited: true,
        activePlanId: null,
        subscriptionExpiresAt: null,
        needsAuthForCheckout: false,
        realtimeVoice: {
          includedMinutes: 999_999,
          usedMinutes: 0,
          remainingMinutes: 999_999,
          canBuyMore: false,
        },
      };
    }

    const [freeSessionsUsed, subscriptions] = await Promise.all([
      this.deps.repository.countOwnerSessions(owner),
      owner.userId
        ? this.deps.repository.findActiveSubscriptionsByUserId(owner.userId)
        : Promise.resolve([]),
    ]);

    const plans = subscriptions.map((subscription) => ({
      subscription,
      plan: getBillingPlan(subscription.planId),
    }));
    const activeSubscription = plans.find(
      (item) => item.plan.kind === 'subscription'
    );
    const hasActiveSubscription = Boolean(activeSubscription);
    const includedRealtimeMinutes = plans.reduce(
      (sum, item) => sum + item.plan.realtimeVoiceMinutes,
      0
    );
    const now = new Date();
    const usageWindow = resolveRealtimeUsageWindow(
      activeSubscription?.subscription.currentPeriodEnd ??
        plans[0]?.subscription.currentPeriodEnd ??
        now
    );
    const realtimeUsedSeconds = owner.userId
      ? await this.deps.repository.countRealtimeVoiceUsageSeconds(owner, {
          windowStart: usageWindow.windowStart,
          windowEnd: usageWindow.windowEnd,
          idleTimeoutMs: REALTIME_VOICE_IDLE_TIMEOUT_SECONDS * 1000,
          now,
        })
      : 0;
    const usedRealtimeMinutes = Math.ceil(realtimeUsedSeconds / 60);
    const remainingRealtimeMinutes = Math.max(
      0,
      includedRealtimeMinutes - usedRealtimeMinutes
    );

    return {
      freeSessionsLimit: FREE_SESSIONS_LIMIT,
      freeSessionsUsed,
      canCreateInterview:
        hasActiveSubscription || freeSessionsUsed < FREE_SESSIONS_LIMIT,
      hasActiveSubscription,
      unlimited: false,
      activePlanId: activeSubscription?.plan.id ?? null,
      subscriptionExpiresAt:
        activeSubscription?.subscription.currentPeriodEnd.toISOString() ?? null,
      needsAuthForCheckout: !owner.userId,
      realtimeVoice: {
        includedMinutes: includedRealtimeMinutes,
        usedMinutes: usedRealtimeMinutes,
        remainingMinutes: remainingRealtimeMinutes,
        canBuyMore: Boolean(owner.userId),
      },
    };
  }

  async assertCanCreateInterview(
    owner: BillingOwner
  ): Promise<BillingStatusResponse> {
    const status = await this.getStatus(owner);
    if (!status.canCreateInterview) {
      throw apiError(
        'E_FORBIDDEN',
        'Бесплатный лимит исчерпан. Выберите тариф, чтобы продолжить тренировки.',
        status
      );
    }
    return status;
  }
}

function resolveRealtimeUsageWindow(periodEnd: Date): {
  windowStart: Date;
  windowEnd: Date;
} {
  return {
    windowStart: new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000),
    windowEnd: periodEnd,
  };
}

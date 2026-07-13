import type {
  BillingActiveAccess,
  BillingStatusResponse,
} from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type {
  BillingOwner,
  BillingRepository,
  PaidAccessRecord,
  PaymentMethodRecord,
} from '@/server/interface/billingRepository';
import {
  ALL_SESSION_GOALS,
  FREE_ALLOWED_SESSION_GOALS,
  FREE_SESSIONS_LIMIT,
  FREE_TRIAL_VOICE_MINUTES,
  FREE_TRIAL_VOICE_TTL_DAYS,
  SESSION_CREATION_BURST_LIMIT,
  SESSION_CREATION_BURST_WINDOW_MS,
  SESSION_CREATION_DAILY_LIMIT,
  TRIAL_VOICE_GRANT_PLAN_ID,
  findBillingPlan,
  getPassPlans,
  type SessionGoalAccess,
} from './plans';

// Представление записи доступа для статуса: активен / истёк / отсутствует.
interface AccessView {
  active: boolean;
  activeAccess: BillingActiveAccess | null;
  lastAccessEndedAt: string | null;
  lastAccessPlanName: string | null;
  access: PaidAccessRecord | null;
}

export class BillingAccessService {
  constructor(
    private readonly deps: {
      repository: Pick<
        BillingRepository,
        | 'countOwnerSessions'
        | 'countOwnerSessionsSince'
        | 'findAccessByUserId'
        | 'getRealtimeMinuteBalance'
        | 'ensureTrialRealtimeGrant'
        | 'findPaymentMethodByUserId'
        | 'findUserEmail'
        | 'claimReadyGiftsByEmail'
      >;
    }
  ) {}

  async getStatus(owner: BillingOwner): Promise<BillingStatusResponse> {
    const now = new Date();

    if (owner.userId) {
      const email = await this.deps.repository.findUserEmail(owner.userId);
      if (email) {
        await this.deps.repository.claimReadyGiftsByEmail({
          recipientEmail: email.trim().toLowerCase(),
          beneficiaryUserId: owner.userId,
          plans: getPassPlans().map((plan) => ({
            id: plan.id,
            type: plan.type,
            durationDays: plan.durationDays,
            realtimeVoiceMinutes: plan.realtimeVoiceMinutes,
            priceRub: plan.priceRub,
          })),
        });
      }

      // Триал-минуты голоса. Выдаём до расчёта баланса, чтобы getRealtimeMinuteBalance
      // ниже уже увидел грант. Админам не нужно — у них безлимит (ветка ниже).
      if (owner.role !== 'admin') {
        await this.deps.repository.ensureTrialRealtimeGrant({
          userId: owner.userId,
          totalSeconds: FREE_TRIAL_VOICE_MINUTES * 60,
          planId: TRIAL_VOICE_GRANT_PLAN_ID,
          expiresAt: new Date(
            now.getTime() + FREE_TRIAL_VOICE_TTL_DAYS * 24 * 60 * 60 * 1000
          ),
        });
      }
    }

    const [freeSessionsUsed, access, minuteBalance, paymentMethod] =
      await Promise.all([
        this.deps.repository.countOwnerSessions(owner),
        owner.userId
          ? this.deps.repository.findAccessByUserId(owner.userId)
          : Promise.resolve(null),
        owner.userId
          ? this.deps.repository.getRealtimeMinuteBalance(owner.userId, now)
          : Promise.resolve({
              totalSeconds: 0,
              consumedSeconds: 0,
              remainingSeconds: 0,
            }),
        owner.userId
          ? this.deps.repository.findPaymentMethodByUserId(owner.userId)
          : Promise.resolve(null),
      ]);

    const view = buildAccessView(access, now);
    const billing = buildBillingInfo({
      userId: owner.userId,
      view,
      paymentMethod,
    });

    // Admin — безлимит, лимиты не считаем. Но реальный billing-блок
    // (карта, автопродление) возвращаем: админ должен видеть и тестировать
    // привязку карты и автосписания как обычный пользователь.
    if (owner.role === 'admin') {
      return {
        freeSessionsLimit: FREE_SESSIONS_LIMIT,
        freeSessionsUsed: 0,
        canCreateInterview: true,
        allowedSessionGoals: ALL_SESSION_GOALS,
        hasActivePaidAccess: view.active,
        hasRecurringRenewal: view.active && Boolean(view.access?.autoRenew),
        unlimited: true,
        activeAccess: view.activeAccess,
        lastAccessEndedAt: view.lastAccessEndedAt,
        lastAccessPlanName: view.lastAccessPlanName,
        billing,
        needsAuthForCheckout: !owner.userId,
        realtimeVoice: {
          includedMinutes: 999_999,
          usedMinutes: 0,
          remainingMinutes: 999_999,
          canBuyMore: true,
        },
      };
    }

    const canCreateInterview =
      view.active || freeSessionsUsed < FREE_SESSIONS_LIMIT;
    const allowedSessionGoals: SessionGoalAccess[] = view.active
      ? ALL_SESSION_GOALS
      : FREE_ALLOWED_SESSION_GOALS;

    const includedMinutes = Math.floor(minuteBalance.totalSeconds / 60);
    const remainingMinutes = Math.floor(minuteBalance.remainingSeconds / 60);
    const usedMinutes = Math.max(0, includedMinutes - remainingMinutes);

    return {
      freeSessionsLimit: FREE_SESSIONS_LIMIT,
      freeSessionsUsed,
      canCreateInterview,
      allowedSessionGoals,
      hasActivePaidAccess: view.active,
      hasRecurringRenewal: view.active && Boolean(view.access?.autoRenew),
      unlimited: false,
      activeAccess: view.activeAccess,
      lastAccessEndedAt: view.lastAccessEndedAt,
      lastAccessPlanName: view.lastAccessPlanName,
      billing,
      needsAuthForCheckout: !owner.userId,
      realtimeVoice: {
        includedMinutes,
        usedMinutes,
        remainingMinutes,
        // Пакеты минут — расходник к активному пропуску.
        canBuyMore: Boolean(owner.userId) && view.active,
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
        'Бесплатное интервью использовано. Оформите доступ, чтобы продолжить тренировки.',
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
        'Бесплатно доступно быстрое интервью. Стандартный и глубокий форматы — с пропуском «Полный доступ».',
        status
      );
    }
    if (!status.unlimited) {
      await this.assertSessionCreationWithinLimits(owner);
    }
    return status;
  }

  // Антиабьюз «безлимита» (ТЗ тарифы v2, раздел 2): эксплуатационная защита
  // от автоматизации, а не продуктовый лимит — честный пользователь порогов
  // не замечает.
  private async assertSessionCreationWithinLimits(
    owner: BillingOwner
  ): Promise<void> {
    const now = Date.now();
    const [burstCount, dailyCount] = await Promise.all([
      this.deps.repository.countOwnerSessionsSince(
        owner,
        new Date(now - SESSION_CREATION_BURST_WINDOW_MS)
      ),
      this.deps.repository.countOwnerSessionsSince(
        owner,
        new Date(now - 24 * 60 * 60 * 1000)
      ),
    ]);
    if (dailyCount >= SESSION_CREATION_DAILY_LIMIT) {
      console.warn('[billing] session creation daily limit hit', {
        userId: owner.userId ?? null,
        anonymousSessionId: owner.anonymousSessionId,
        dailyCount,
      });
      throw apiError(
        'E_RATE',
        'Слишком много интервью за сутки. Продолжить можно завтра — лимит защищает сервис от автоматизации.'
      );
    }
    if (burstCount >= SESSION_CREATION_BURST_LIMIT) {
      throw apiError(
        'E_RATE',
        'Слишком много интервью подряд. Подождите несколько минут и начните снова.'
      );
    }
  }
}

function buildAccessView(
  access: PaidAccessRecord | null,
  now: Date
): AccessView {
  if (!access) {
    return {
      active: false,
      activeAccess: null,
      lastAccessEndedAt: null,
      lastAccessPlanName: null,
      access: null,
    };
  }
  const plan = findBillingPlan(access.planId);
  const planName = plan?.name ?? access.planId;
  const active = access.status === 'active' && access.currentPeriodEnd > now;
  if (active) {
    return {
      active: true,
      activeAccess: {
        planId: access.planId,
        planName,
        durationDays: plan?.durationDays ?? 30,
        expiresAt: access.currentPeriodEnd.toISOString(),
      },
      lastAccessEndedAt: null,
      lastAccessPlanName: null,
      access,
    };
  }
  return {
    active: false,
    activeAccess: null,
    lastAccessEndedAt: access.currentPeriodEnd.toISOString(),
    lastAccessPlanName: planName,
    access,
  };
}

// Информация об автопродлении: когда и сколько спишется, с какой карты,
// была ли ошибка последнего списания. Блок возвращается ЛЮБОМУ
// авторизованному пользователю — UI показывает «Привязать карту», когда
// карты нет. Сумма — зафиксированная при покупке, не из каталога.
function buildBillingInfo(params: {
  userId: string | null | undefined;
  view: AccessView;
  paymentMethod: PaymentMethodRecord | null;
}): BillingStatusResponse['billing'] {
  if (!params.userId) return null;
  const { view } = params;
  const renewalOn = view.active && Boolean(view.access?.autoRenew);
  const activePaymentMethod =
    params.paymentMethod?.status === 'active' ? params.paymentMethod : null;
  return {
    autoRenew: renewalOn,
    nextChargeAt:
      renewalOn && view.access?.nextChargeAt
        ? view.access.nextChargeAt.toISOString()
        : null,
    nextChargeAmountRub: renewalOn
      ? view.access?.renewalAmountRub ??
        findBillingPlan(view.access!.planId)?.priceRub ??
        null
      : null,
    lastChargeError: view.access?.lastChargeError ?? null,
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

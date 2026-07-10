import { describe, expect, it, vi } from 'vitest';
import { BillingAccessService } from './accessService';

function createRepository(
  overrides: {
    sessionsUsed?: number;
    sessionsSince?: number;
    hasActiveSubscription?: boolean;
    subscriptionPlanIds?: string[];
    minuteBalance?: {
      totalSeconds: number;
      consumedSeconds: number;
      remainingSeconds: number;
    };
  } = {}
) {
  return {
    countOwnerSessions: vi.fn().mockResolvedValue(overrides.sessionsUsed ?? 0),
    countOwnerSessionsSince: vi
      .fn()
      .mockResolvedValue(overrides.sessionsSince ?? 0),
    findActiveSubscriptionsByUserId: vi.fn().mockResolvedValue(
      (overrides.subscriptionPlanIds ??
        (overrides.hasActiveSubscription ? ['pro_monthly'] : [])).map(
        (planId, index) => ({
          id: `sub_${index + 1}`,
          userId: 'user_1',
          planId,
          status: 'active',
          provider: 'yookassa',
          providerPaymentId: `pay_${index + 1}`,
          currentPeriodEnd: new Date('2026-07-28T10:00:00.000Z'),
          autoRenew: false,
          nextChargeAt: null,
          lastChargeAttemptAt: null,
          lastChargeError: null,
          createdAt: new Date('2026-06-28T10:00:00.000Z'),
          updatedAt: new Date('2026-06-28T10:00:00.000Z'),
        })
      )
    ),
    getRealtimeMinuteBalance: vi.fn().mockResolvedValue(
      overrides.minuteBalance ?? {
        totalSeconds: 0,
        consumedSeconds: 0,
        remainingSeconds: 0,
      }
    ),
    findPaymentMethodByUserId: vi.fn().mockResolvedValue(null),
  };
}

describe('BillingAccessService', () => {
  it('allows the first anonymous interview', async () => {
    const service = new BillingAccessService({
      repository: createRepository({ sessionsUsed: 0 }),
    });

    await expect(
      service.assertCanCreateInterview({
        anonymousSessionId: 'anon_1',
        userId: null,
      })
    ).resolves.toMatchObject({
      canCreateInterview: true,
      freeSessionsUsed: 0,
      allowedSessionGoals: ['quick'],
    });
  });

  it('blocks a second free interview without active subscription', async () => {
    const service = new BillingAccessService({
      repository: createRepository({ sessionsUsed: 1 }),
    });

    await expect(
      service.assertCanCreateInterview({
        anonymousSessionId: 'anon_1',
        userId: null,
      })
    ).rejects.toThrow('Бесплатный лимит исчерпан');
  });

  it('blocks deep formats for free users', async () => {
    const service = new BillingAccessService({
      repository: createRepository({ sessionsUsed: 0 }),
    });

    await expect(
      service.assertCanCreateInterview(
        { anonymousSessionId: 'anon_1', userId: null },
        { sessionGoal: 'deep' }
      )
    ).rejects.toThrow('быстрое интервью');

    await expect(
      service.assertCanCreateInterview(
        { anonymousSessionId: 'anon_1', userId: null },
        { sessionGoal: 'quick' }
      )
    ).resolves.toMatchObject({ canCreateInterview: true });
  });

  it('allows paid users after the free limit with all formats', async () => {
    const repository = createRepository({
      sessionsUsed: 4,
      hasActiveSubscription: true,
    });
    const service = new BillingAccessService({ repository });

    await expect(
      service.assertCanCreateInterview(
        { anonymousSessionId: 'anon_1', userId: 'user_1' },
        { sessionGoal: 'deep' }
      )
    ).resolves.toMatchObject({
      canCreateInterview: true,
      hasActiveSubscription: true,
      allowedSessionGoals: ['quick', 'standard', 'deep'],
    });
    expect(repository.findActiveSubscriptionsByUserId).toHaveBeenCalledWith(
      'user_1'
    );
  });

  it('grants exactly one paid interview on the one-time prep plan', async () => {
    const unused = new BillingAccessService({
      repository: createRepository({
        sessionsUsed: 1,
        sessionsSince: 0,
        subscriptionPlanIds: ['single_prep'],
      }),
    });
    await expect(
      unused.getStatus({ anonymousSessionId: 'anon_1', userId: 'user_1' })
    ).resolves.toMatchObject({
      canCreateInterview: true,
      hasActiveSubscription: false,
      paidInterviewsRemaining: 1,
      activePlanId: 'single_prep',
      allowedSessionGoals: ['quick', 'standard', 'deep'],
      realtimeVoice: { canBuyMore: true },
    });

    const used = new BillingAccessService({
      repository: createRepository({
        sessionsUsed: 2,
        sessionsSince: 1,
        subscriptionPlanIds: ['single_prep'],
      }),
    });
    await expect(
      used.getStatus({ anonymousSessionId: 'anon_1', userId: 'user_1' })
    ).resolves.toMatchObject({
      canCreateInterview: false,
      paidInterviewsRemaining: 0,
    });
  });

  it('stacks interview entitlements from two active one-time purchases', async () => {
    const service = new BillingAccessService({
      repository: createRepository({
        sessionsUsed: 2,
        sessionsSince: 1,
        subscriptionPlanIds: ['single_prep', 'single_prep'],
      }),
    });

    await expect(
      service.getStatus({ anonymousSessionId: 'anon_1', userId: 'user_1' })
    ).resolves.toMatchObject({
      canCreateInterview: true,
      paidInterviewsRemaining: 1,
      allowedSessionGoals: ['quick', 'standard', 'deep'],
    });
  });

  it('reads realtime minutes from the ledger balance', async () => {
    const service = new BillingAccessService({
      repository: createRepository({
        sessionsUsed: 4,
        subscriptionPlanIds: ['pro_monthly'],
        minuteBalance: {
          totalSeconds: 120 * 60,
          consumedSeconds: 75 * 60 + 12,
          remainingSeconds: 120 * 60 - (75 * 60 + 12),
        },
      }),
    });

    await expect(
      service.getStatus({
        anonymousSessionId: 'anon_1',
        userId: 'user_1',
      })
    ).resolves.toMatchObject({
      hasActiveSubscription: true,
      activePlanId: 'pro_monthly',
      realtimeVoice: {
        includedMinutes: 120,
        usedMinutes: 76,
        remainingMinutes: 44,
        canBuyMore: true,
      },
    });
  });

  it('does not offer minute packs without an active paid plan', async () => {
    const service = new BillingAccessService({
      repository: createRepository({
        sessionsUsed: 0,
        subscriptionPlanIds: [],
        minuteBalance: {
          totalSeconds: 600,
          consumedSeconds: 0,
          remainingSeconds: 600,
        },
      }),
    });

    await expect(
      service.getStatus({ anonymousSessionId: 'anon_1', userId: 'user_1' })
    ).resolves.toMatchObject({
      realtimeVoice: { canBuyMore: false },
    });
  });

  it('keeps admin unlimited while returning real plan and billing data', async () => {
    const repository = createRepository({
      subscriptionPlanIds: ['pro_monthly'],
    });
    repository.findActiveSubscriptionsByUserId.mockResolvedValue([
      {
        id: 'sub_1',
        userId: 'admin_1',
        planId: 'pro_monthly',
        status: 'active',
        provider: 'yookassa',
        providerPaymentId: 'pay_1',
        currentPeriodEnd: new Date('2026-08-10T10:00:00.000Z'),
        autoRenew: true,
        nextChargeAt: new Date('2026-08-10T10:00:00.000Z'),
        lastChargeAttemptAt: null,
        lastChargeError: 'Предыдущая попытка отклонена',
        createdAt: new Date('2026-07-10T10:00:00.000Z'),
        updatedAt: new Date('2026-07-10T10:00:00.000Z'),
      },
    ]);
    repository.findPaymentMethodByUserId.mockResolvedValue({
      id: 'method_1',
      userId: 'admin_1',
      provider: 'yookassa',
      providerPaymentMethodId: 'pm_1',
      status: 'active',
      methodType: 'bank_card',
      title: 'Банковская карта *4242',
      cardBrand: 'Visa',
      cardLast4: '4242',
      cardExpiryMonth: '12',
      cardExpiryYear: '30',
      createdAt: new Date('2026-07-10T10:00:00.000Z'),
    });
    const service = new BillingAccessService({ repository });

    await expect(
      service.getStatus({
        anonymousSessionId: 'anon_admin',
        userId: 'admin_1',
        role: 'admin',
      })
    ).resolves.toMatchObject({
      unlimited: true,
      canCreateInterview: true,
      hasActiveSubscription: true,
      activePlanId: 'pro_monthly',
      subscriptionExpiresAt: '2026-08-10T10:00:00.000Z',
      billing: {
        autoRenew: true,
        nextChargeAt: '2026-08-10T10:00:00.000Z',
        nextChargeAmountRub: 990,
        lastChargeError: 'Предыдущая попытка отклонена',
        paymentMethod: {
          title: 'Банковская карта *4242',
          cardBrand: 'Visa',
          cardLast4: '4242',
        },
      },
      realtimeVoice: { canBuyMore: true },
    });
    expect(repository.countOwnerSessions).not.toHaveBeenCalled();
  });

  it('keeps minute packs enabled by the admin access contract', async () => {
    const service = new BillingAccessService({
      repository: createRepository(),
    });

    await expect(
      service.getStatus({
        anonymousSessionId: 'anon_admin',
        userId: null,
        role: 'admin',
      })
    ).resolves.toMatchObject({
      unlimited: true,
      realtimeVoice: { canBuyMore: true },
    });
  });

  it('returns an active one-time plan for admin without dropping unlimited access', async () => {
    const repository = createRepository({
      subscriptionPlanIds: ['single_prep'],
    });
    const service = new BillingAccessService({ repository });

    await expect(
      service.getStatus({
        anonymousSessionId: 'anon_admin',
        userId: 'user_1',
        role: 'admin',
      })
    ).resolves.toMatchObject({
      unlimited: true,
      hasActiveSubscription: false,
      activePlanId: 'single_prep',
      activePlanName: 'Разовая подготовка',
      subscriptionExpiresAt: '2026-07-28T10:00:00.000Z',
      realtimeVoice: { canBuyMore: true },
    });
  });
});

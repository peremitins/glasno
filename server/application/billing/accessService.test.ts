import { describe, expect, it, vi } from 'vitest';
import { BillingAccessService } from './accessService';

function createRepository(overrides: {
  sessionsUsed?: number;
  hasActiveSubscription?: boolean;
  subscriptionPlanIds?: string[];
  realtimeUsedSeconds?: number;
} = {}) {
  return {
    countOwnerSessions: vi.fn().mockResolvedValue(overrides.sessionsUsed ?? 0),
    findActiveSubscriptionsByUserId: vi.fn().mockResolvedValue(
      (overrides.subscriptionPlanIds ??
        (overrides.hasActiveSubscription ? ['pro_monthly'] : [])).map(
        (planId, index) => ({
          id: `sub_${index + 1}`,
          userId: 'user_1',
          planId,
          status: 'active',
          currentPeriodEnd: new Date('2026-07-28T10:00:00.000Z'),
          createdAt: new Date('2026-06-28T10:00:00.000Z'),
          updatedAt: new Date('2026-06-28T10:00:00.000Z'),
        })
      )
    ),
    countRealtimeVoiceUsageSeconds: vi
      .fn()
      .mockResolvedValue(overrides.realtimeUsedSeconds ?? 0),
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

  it('allows paid users after the free limit', async () => {
    const repository = createRepository({
      sessionsUsed: 4,
      hasActiveSubscription: true,
    });
    const service = new BillingAccessService({ repository });

    await expect(
      service.assertCanCreateInterview({
        anonymousSessionId: 'anon_1',
        userId: 'user_1',
      })
    ).resolves.toMatchObject({
      canCreateInterview: true,
      hasActiveSubscription: true,
    });
    expect(repository.findActiveSubscriptionsByUserId).toHaveBeenCalledWith(
      'user_1'
    );
  });

  it('subtracts used realtime voice seconds from subscription and add-on minutes', async () => {
    const service = new BillingAccessService({
      repository: createRepository({
        sessionsUsed: 4,
        subscriptionPlanIds: ['pro_monthly', 'realtime_voice_60'],
        realtimeUsedSeconds: 75 * 60 + 12,
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
});

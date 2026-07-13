import { describe, expect, it, vi } from 'vitest';
import type { PaidAccessRecord } from '@/server/interface/billingRepository';
import { BillingAccessService } from './accessService';

const FUTURE = new Date('2030-01-01T10:00:00.000Z');
const PAST = new Date('2020-01-01T10:00:00.000Z');

function accessRecord(
  overrides: Partial<PaidAccessRecord> = {}
): PaidAccessRecord {
  return {
    id: 'access_1',
    userId: 'user_1',
    planId: 'pass_30d',
    status: 'active',
    provider: 'yookassa',
    providerPaymentId: 'pay_1',
    currentPeriodEnd: FUTURE,
    autoRenew: true,
    nextChargeAt: FUTURE,
    lastChargeAttemptAt: null,
    lastChargeError: null,
    chargeAttempts: 0,
    renewalPlanId: 'pass_30d',
    renewalAmountRub: 1190,
    renewalNoticeSentAt: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    ...overrides,
  };
}

function createRepository(
  overrides: {
    sessionsUsed?: number;
    sessionsSince?: number;
    access?: PaidAccessRecord | null;
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
    findAccessByUserId: vi.fn().mockResolvedValue(overrides.access ?? null),
    getRealtimeMinuteBalance: vi.fn().mockResolvedValue(
      overrides.minuteBalance ?? {
        totalSeconds: 0,
        consumedSeconds: 0,
        remainingSeconds: 0,
      }
    ),
    ensureTrialRealtimeGrant: vi.fn().mockResolvedValue(undefined),
    findPaymentMethodByUserId: vi.fn().mockResolvedValue(null),
    findUserEmail: vi.fn().mockResolvedValue('friend@example.com'),
    claimReadyGiftsByEmail: vi.fn().mockResolvedValue([]),
  };
}

describe('BillingAccessService', () => {
  it('claims gifts for the verified email before resolving paid access', async () => {
    const repository = createRepository();
    const service = new BillingAccessService({ repository });

    await service.getStatus({
      anonymousSessionId: 'anon_1',
      userId: 'user_1',
    });

    expect(repository.claimReadyGiftsByEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'friend@example.com',
        beneficiaryUserId: 'user_1',
        plans: expect.arrayContaining([
          expect.objectContaining({
            id: 'pass_30d',
            type: 'pass',
            durationDays: 30,
            priceRub: 1190,
          }),
        ]),
      })
    );
  });

  it('issues a one-time trial voice grant for an authenticated user', async () => {
    const repository = createRepository();
    const service = new BillingAccessService({ repository });

    await service.getStatus({ anonymousSessionId: 'anon_1', userId: 'user_1' });

    expect(repository.ensureTrialRealtimeGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        totalSeconds: 5 * 60,
        planId: 'trial',
        expiresAt: expect.any(Date),
      })
    );
  });

  it('does not grant trial voice minutes to anonymous visitors', async () => {
    const repository = createRepository();
    const service = new BillingAccessService({ repository });

    await service.getStatus({ anonymousSessionId: 'anon_1', userId: null });

    expect(repository.ensureTrialRealtimeGrant).not.toHaveBeenCalled();
  });

  it('does not grant trial voice minutes to admins (unlimited already)', async () => {
    const repository = createRepository();
    const service = new BillingAccessService({ repository });

    await service.getStatus({
      anonymousSessionId: 'anon_admin',
      userId: 'admin_1',
      role: 'admin',
    });

    expect(repository.ensureTrialRealtimeGrant).not.toHaveBeenCalled();
  });

  it('allows the first anonymous interview as trial', async () => {
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
      hasActivePaidAccess: false,
      allowedSessionGoals: ['quick'],
    });
  });

  it('blocks a second free interview without an active pass', async () => {
    const service = new BillingAccessService({
      repository: createRepository({ sessionsUsed: 1 }),
    });

    await expect(
      service.assertCanCreateInterview({
        anonymousSessionId: 'anon_1',
        userId: null,
      })
    ).rejects.toThrow('Бесплатное интервью использовано');
  });

  it('blocks deep formats for trial users', async () => {
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

  it('opens all formats and unlimited interviews with an active pass', async () => {
    const service = new BillingAccessService({
      repository: createRepository({
        sessionsUsed: 12,
        access: accessRecord(),
      }),
    });

    await expect(
      service.assertCanCreateInterview(
        { anonymousSessionId: 'anon_1', userId: 'user_1' },
        { sessionGoal: 'deep' }
      )
    ).resolves.toMatchObject({
      canCreateInterview: true,
      hasActivePaidAccess: true,
      hasRecurringRenewal: true,
      allowedSessionGoals: ['quick', 'standard', 'deep'],
      activeAccess: {
        planId: 'pass_30d',
        planName: 'Полный доступ · 30 дн.',
        durationDays: 30,
        expiresAt: FUTURE.toISOString(),
      },
      realtimeVoice: { canBuyMore: true },
    });
  });

  it('reports the expired pass for the «доступ закончился» state', async () => {
    const service = new BillingAccessService({
      repository: createRepository({
        sessionsUsed: 5,
        access: accessRecord({
          currentPeriodEnd: PAST,
          autoRenew: false,
          nextChargeAt: null,
        }),
      }),
    });

    await expect(
      service.getStatus({ anonymousSessionId: 'anon_1', userId: 'user_1' })
    ).resolves.toMatchObject({
      canCreateInterview: false,
      hasActivePaidAccess: false,
      hasRecurringRenewal: false,
      activeAccess: null,
      lastAccessEndedAt: PAST.toISOString(),
      lastAccessPlanName: 'Полный доступ · 30 дн.',
      allowedSessionGoals: ['quick'],
      realtimeVoice: { canBuyMore: false },
    });
  });

  it('reports fixed renewal price and last charge error in billing info', async () => {
    const repository = createRepository({
      access: accessRecord({
        renewalAmountRub: 999,
        lastChargeError: 'Списание отклонено (canceled)',
      }),
    });
    repository.findPaymentMethodByUserId.mockResolvedValue({
      id: 'method_1',
      userId: 'user_1',
      provider: 'yookassa',
      providerPaymentMethodId: 'pm_1',
      status: 'active',
      methodType: 'bank_card',
      title: 'Банковская карта *4242',
      cardBrand: 'Visa',
      cardLast4: '4242',
      cardExpiryMonth: '12',
      cardExpiryYear: '30',
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
    });
    const service = new BillingAccessService({ repository });

    await expect(
      service.getStatus({ anonymousSessionId: 'anon_1', userId: 'user_1' })
    ).resolves.toMatchObject({
      billing: {
        autoRenew: true,
        nextChargeAt: FUTURE.toISOString(),
        nextChargeAmountRub: 999,
        lastChargeError: 'Списание отклонено (canceled)',
        paymentMethod: { cardLast4: '4242' },
      },
    });
  });

  it('reads realtime minutes from the ledger balance', async () => {
    const service = new BillingAccessService({
      repository: createRepository({
        access: accessRecord(),
        minuteBalance: {
          totalSeconds: 120 * 60,
          consumedSeconds: 75 * 60 + 12,
          remainingSeconds: 120 * 60 - (75 * 60 + 12),
        },
      }),
    });

    await expect(
      service.getStatus({ anonymousSessionId: 'anon_1', userId: 'user_1' })
    ).resolves.toMatchObject({
      realtimeVoice: {
        includedMinutes: 120,
        usedMinutes: 76,
        remainingMinutes: 44,
        canBuyMore: true,
      },
    });
  });

  it('does not offer minute packs without an active pass', async () => {
    const service = new BillingAccessService({
      repository: createRepository({
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

  describe('anti-abuse limits (внутренние, не продуктовые)', () => {
    it('blocks a creation burst beyond the window limit', async () => {
      const repository = createRepository({
        sessionsUsed: 3,
        access: accessRecord(),
      });
      // burst-окно: 3 сессии за 10 минут уже созданы.
      repository.countOwnerSessionsSince.mockResolvedValue(3);
      const service = new BillingAccessService({ repository });

      await expect(
        service.assertCanCreateInterview({
          anonymousSessionId: 'anon_1',
          userId: 'user_1',
        })
      ).rejects.toThrow('Слишком много интервью подряд');
    });

    it('blocks the daily limit with an ops alert', async () => {
      const repository = createRepository({
        sessionsUsed: 25,
        access: accessRecord(),
      });
      repository.countOwnerSessionsSince.mockImplementation(
        async (_owner, since: Date) =>
          // 0 в burst-окне, 20 за сутки.
          Date.now() - since.getTime() > 60 * 60 * 1000 ? 20 : 0
      );
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const service = new BillingAccessService({ repository });

      await expect(
        service.assertCanCreateInterview({
          anonymousSessionId: 'anon_1',
          userId: 'user_1',
        })
      ).rejects.toThrow('Слишком много интервью за сутки');
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('does not rate-limit admins', async () => {
      const repository = createRepository();
      repository.countOwnerSessionsSince.mockResolvedValue(100);
      const service = new BillingAccessService({ repository });

      await expect(
        service.assertCanCreateInterview({
          anonymousSessionId: 'anon_admin',
          userId: 'admin_1',
          role: 'admin',
        })
      ).resolves.toMatchObject({ unlimited: true });
    });
  });

  it('keeps admin unlimited while returning real access and billing data', async () => {
    const repository = createRepository({
      access: accessRecord({ lastChargeError: 'Предыдущая попытка отклонена' }),
    });
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
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
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
      hasActivePaidAccess: true,
      activeAccess: { planId: 'pass_30d' },
      billing: {
        autoRenew: true,
        nextChargeAmountRub: 1190,
        lastChargeError: 'Предыдущая попытка отклонена',
        paymentMethod: { cardLast4: '4242' },
      },
      realtimeVoice: { canBuyMore: true },
    });
  });
});

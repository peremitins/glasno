import { describe, expect, it, vi } from 'vitest';
import { GiftNotificationService } from './giftNotificationService';

const NOW = new Date('2026-07-01T10:00:00.000Z');

function gift(attempts = 1) {
  return {
    id: 'gift_1',
    orderId: 'order_1',
    purchaserUserId: 'user_1',
    recipientEmail: 'friend@example.com',
    senderName: 'Николай',
    planId: 'pass_30d',
    status: 'ready' as const,
    paidAt: NOW,
    claimExpiresAt: new Date('2027-01-01T10:00:00.000Z'),
    claimedAt: null,
    claimedByUserId: null,
    notificationStatus: 'sending' as const,
    notificationAttempts: attempts,
    notificationNextAttemptAt: new Date('2026-07-01T10:10:00.000Z'),
    notificationSentAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('GiftNotificationService', () => {
  it('marks a claimed notification sent after SMTP succeeds', async () => {
    const repository = {
      claimGiftNotifications: vi.fn().mockResolvedValue([gift()]),
      markGiftNotificationSent: vi.fn().mockResolvedValue(undefined),
      markGiftNotificationFailed: vi.fn().mockResolvedValue(undefined),
    };
    const sendEmail = vi.fn().mockResolvedValue(true);
    const service = new GiftNotificationService({
      repository,
      sendEmail,
      appUrl: 'https://glasno.test',
    });

    await expect(service.runSweep({ now: NOW })).resolves.toEqual({
      processed: 1,
      sent: 1,
      failed: 0,
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'friend@example.com',
        senderName: 'Николай',
        loginUrl: 'https://glasno.test/auth?next=%2Fpricing%3Fgift%3Dreceived',
      })
    );
    expect(repository.markGiftNotificationSent).toHaveBeenCalledWith({
      giftId: 'gift_1',
      now: NOW,
    });
  });

  it('schedules a retry after SMTP failure and stops after the fifth attempt', async () => {
    const repository = {
      claimGiftNotifications: vi
        .fn()
        .mockResolvedValue([gift(2), { ...gift(5), id: 'gift_5' }]),
      markGiftNotificationSent: vi.fn().mockResolvedValue(undefined),
      markGiftNotificationFailed: vi.fn().mockResolvedValue(undefined),
    };
    const service = new GiftNotificationService({
      repository,
      sendEmail: vi.fn().mockResolvedValue(false),
      appUrl: 'https://glasno.test',
    });

    await service.runSweep({ now: NOW });

    expect(repository.markGiftNotificationFailed).toHaveBeenNthCalledWith(1, {
      giftId: 'gift_1',
      now: NOW,
      nextAttemptAt: new Date('2026-07-01T10:10:00.000Z'),
    });
    expect(repository.markGiftNotificationFailed).toHaveBeenNthCalledWith(2, {
      giftId: 'gift_5',
      now: NOW,
      nextAttemptAt: null,
    });
  });
});

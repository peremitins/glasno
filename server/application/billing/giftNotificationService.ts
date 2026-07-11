import type {
  BillingRepository,
  GiftEntitlementRecord,
} from '@/server/interface/billingRepository';
import { findBillingPlan } from './plans';

interface GiftEmailInput {
  to: string;
  senderName: string;
  planName: string;
  claimExpiresAt: Date;
  loginUrl: string;
}

export class GiftNotificationService {
  constructor(
    private readonly deps: {
      repository: Pick<
        BillingRepository,
        | 'claimGiftNotifications'
        | 'markGiftNotificationSent'
        | 'markGiftNotificationFailed'
      >;
      sendEmail: (input: GiftEmailInput) => Promise<boolean>;
      appUrl: string;
    }
  ) {}

  async runSweep(params?: {
    now?: Date;
    limit?: number;
  }): Promise<{ processed: number; sent: number; failed: number }> {
    const now = params?.now ?? new Date();
    const gifts = await this.deps.repository.claimGiftNotifications({
      now,
      limit: params?.limit ?? 20,
    });
    let sent = 0;
    let failed = 0;

    for (const gift of gifts) {
      const delivered = await this.send(gift);
      if (delivered) {
        await this.deps.repository.markGiftNotificationSent({
          giftId: gift.id,
          now,
        });
        sent += 1;
        continue;
      }

      await this.deps.repository.markGiftNotificationFailed({
        giftId: gift.id,
        now,
        nextAttemptAt: nextAttemptAt(gift.notificationAttempts, now),
      });
      failed += 1;
    }

    return { processed: gifts.length, sent, failed };
  }

  private async send(gift: GiftEntitlementRecord): Promise<boolean> {
    if (!gift.claimExpiresAt) return false;
    // Подарок на несуществующий тариф (старые dev-данные) не должен ронять
    // весь обход — уходит в ретраи и гаснет после пятой попытки.
    const plan = findBillingPlan(gift.planId);
    if (!plan) return false;
    const loginUrl = new URL('/auth', normalizedBaseUrl(this.deps.appUrl));
    loginUrl.searchParams.set('next', '/pricing?gift=received');
    return await this.deps.sendEmail({
      to: gift.recipientEmail,
      senderName: gift.senderName || 'Пользователь Гласно',
      planName: plan.name,
      claimExpiresAt: gift.claimExpiresAt,
      loginUrl: loginUrl.toString(),
    });
  }
}

function nextAttemptAt(attempts: number, now: Date): Date | null {
  if (attempts >= 5) return null;
  const minutes = Math.min(360, 5 * 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function normalizedBaseUrl(appUrl: string): string {
  return `${appUrl.replace(/\/$/, '')}/`;
}

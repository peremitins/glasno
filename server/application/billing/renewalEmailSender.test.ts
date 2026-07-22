import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSmtpEmail } from '@/server/infrastructure/email/smtpEmailSender';
import {
  sendRenewalChargedEmail,
  sendRenewalFailedEmail,
  sendRenewalManualReviewEmail,
  sendRenewalNoticeEmail,
} from './renewalEmailSender';

vi.mock('@/server/infrastructure/email/smtpEmailSender', () => ({
  sendSmtpEmail: vi.fn(),
}));

describe('renewalEmailSender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendSmtpEmail).mockResolvedValue(true);
  });

  it('uses payment-method-neutral copy in every renewal email', async () => {
    const common = {
      to: 'user@example.com',
      planName: 'Полный доступ · 30 дн.',
      amountRub: 1190,
      pricingUrl: 'https://my.glasno.app/pricing',
    };

    await sendRenewalNoticeEmail({
      ...common,
      chargeAt: new Date('2026-08-01T10:00:00.000Z'),
    });
    await sendRenewalChargedEmail({
      ...common,
      accessUntil: new Date('2026-08-31T10:00:00.000Z'),
    });
    await sendRenewalFailedEmail(common);

    expect(sendSmtpEmail).toHaveBeenCalledTimes(3);
    for (const [email] of vi.mocked(sendSmtpEmail).mock.calls) {
      expect(email.text).toContain('способа оплаты');
      expect(email.html).toContain('способа оплаты');
      expect(email.text.toLowerCase()).not.toContain('карт');
      expect(email.html.toLowerCase()).not.toContain('карт');
      expect(email.text).toContain('https://my.glasno.app/pricing');
      expect(email.html).toContain('https://my.glasno.app/pricing');
    }
  });

  it('does not invite a second purchase when a renewal needs manual review', async () => {
    await sendRenewalManualReviewEmail({
      to: 'user@example.com',
      planName: 'Полный доступ · 30 дн.',
      amountRub: 1190,
      profileUrl: 'https://my.glasno.app/profile',
    });

    const email = vi.mocked(sendSmtpEmail).mock.calls[0]?.[0];
    expect(email?.text).toContain('Чтобы не списать деньги повторно');
    expect(email?.text).toContain('https://my.glasno.app/profile');
    expect(email?.text).not.toContain('продлите доступ');
    expect(email?.html).not.toContain('Продлить доступ');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSmtpEmail } from '@/server/infrastructure/email/smtpEmailSender';
import { sendGiftNotificationEmail } from './giftEmailSender';

vi.mock('@/server/infrastructure/email/smtpEmailSender', () => ({
  sendSmtpEmail: vi.fn(),
}));

describe('sendGiftNotificationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the activation deadline and login link without exposing email in the URL', async () => {
    vi.mocked(sendSmtpEmail).mockResolvedValue(true);

    await expect(
      sendGiftNotificationEmail({
        to: 'friend@example.com',
        senderName: 'Николай',
        planName: 'Pro',
        claimExpiresAt: new Date('2027-01-01T10:00:00.000Z'),
        loginUrl:
          'https://glasno.test/auth?next=%2Fpricing%3Fgift%3Dreceived',
      })
    ).resolves.toBe(true);

    expect(sendSmtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'friend@example.com',
        subject: 'Вам подарили доступ к Гласно',
        text: expect.stringContaining('01 января 2027 г.'),
      })
    );
    const email = vi.mocked(sendSmtpEmail).mock.calls[0]?.[0];
    expect(email?.text).toContain(
      'Срок тарифа начнётся в момент первого входа'
    );
    expect(email?.text).toContain('Николай дарит вам тариф Pro в Гласно');
    expect(email?.html).toContain('Николай дарит вам тариф Pro в Гласно');
    expect(email?.html).not.toContain('Кто-то подарил вам');
    expect(email?.html).toContain('Забрать подарок');
    expect(email?.html).toContain('Если вы не ожидали это письмо');
    expect(email?.html).toContain(
      'https://glasno.test/auth?next=%2Fpricing%3Fgift%3Dreceived'
    );
    expect(email?.html).not.toContain('friend@example.com');
  });
});

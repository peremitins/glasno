import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSmtpEmail } from '@/server/infrastructure/email/smtpEmailSender';
import { sendSupportEmail } from './supportEmailSender';

vi.mock('@/server/infrastructure/email/smtpEmailSender', () => ({
  sendSmtpEmail: vi.fn(),
}));

describe('sendSupportEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPPORT_EMAIL;
  });

  afterEach(() => {
    delete process.env.SUPPORT_EMAIL;
  });

  it('sends the message with user context and reply-to', async () => {
    vi.mocked(sendSmtpEmail).mockResolvedValue(true);

    await expect(
      sendSupportEmail({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Иван',
          telegramUsername: 'ivan_tg',
        },
        subject: 'Вопрос про оплату',
        message: 'Не проходит оплата картой.',
      })
    ).resolves.toBe(true);

    expect(sendSmtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'peremitinns@gmail.com',
        subject: 'Гласно · Поддержка: Вопрос про оплату',
        replyTo: 'user@example.com',
      })
    );
    const email = vi.mocked(sendSmtpEmail).mock.calls[0]?.[0];
    expect(email?.text).toContain('Не проходит оплата картой.');
    expect(email?.text).toContain('user@example.com');
    expect(email?.text).toContain('@ivan_tg');
    expect(email?.text).toContain('user-1');
    expect(email?.html).toContain('Не проходит оплата картой.');
  });

  it('respects SUPPORT_EMAIL env and works without subject and email', async () => {
    process.env.SUPPORT_EMAIL = 'support@glasno.test';
    vi.mocked(sendSmtpEmail).mockResolvedValue(true);

    await sendSupportEmail({
      user: {
        id: 'user-2',
        email: null,
        displayName: null,
        telegramUsername: null,
      },
      message: 'Просто хочу сказать спасибо!',
    });

    const email = vi.mocked(sendSmtpEmail).mock.calls[0]?.[0];
    expect(email?.to).toBe('support@glasno.test');
    expect(email?.subject).toBe('Гласно · Поддержка: Без темы');
    expect(email?.replyTo).toBeUndefined();
    expect(email?.text).toContain('нет email');
  });

  it('escapes html in the message', async () => {
    vi.mocked(sendSmtpEmail).mockResolvedValue(true);

    await sendSupportEmail({
      user: {
        id: 'user-3',
        email: 'x@example.com',
        displayName: '<b>Хакер</b>',
        telegramUsername: null,
      },
      message: '<script>alert(1)</script>',
    });

    const email = vi.mocked(sendSmtpEmail).mock.calls[0]?.[0];
    expect(email?.html).not.toContain('<script>');
    expect(email?.html).toContain('&lt;script&gt;');
  });
});

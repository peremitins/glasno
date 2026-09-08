import {
  isSmtpConfigured,
  sendSmtpEmail,
} from '@/server/infrastructure/email/smtpEmailSender';

// Отправка писем через SMTP.
// Конфиг берём из env (SMTP_*), которые подгружаются из .env.development.

export { isSmtpConfigured };

// Отправка кода входа. Возвращает true при успехе. Никогда не бросает —
// чтобы сбой SMTP не ломал флоу (в dev код всё равно виден на экране).
export async function sendLoginCodeEmail(
  to: string,
  code: string
): Promise<boolean> {
  const subject = 'Код для входа — Гласно';
  const text = `Ваш код для входа в Гласно: ${code}. Действителен 10 минут.`;
  const html = `
    <div style="font-family: -apple-system, Inter, Arial, sans-serif; line-height: 1.6; color: #14142a;">
      <h2 style="margin: 0 0 12px;">Код для входа в Гласно</h2>
      <p style="margin: 0 0 16px;">Введите этот код, чтобы войти:</p>
      <div style="display: inline-block; font-size: 26px; letter-spacing: 8px; font-weight: 700; padding: 14px 18px; background: #f1f0fb; border-radius: 14px; color: #4f46e5;">
        ${code}
      </div>
      <p style="margin: 16px 0 0; color: #6b6b86;">Код действителен 10 минут. Если вы не запрашивали вход — просто проигнорируйте письмо.</p>
    </div>
  `;

  return await sendSmtpEmail({ to, subject, text, html });
}

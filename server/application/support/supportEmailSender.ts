import { sendSmtpEmail } from '@/server/infrastructure/email/smtpEmailSender';

const DEFAULT_SUPPORT_EMAIL = 'peremitinns@gmail.com';

export function getSupportEmail(): string {
  return process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL;
}

export async function sendSupportEmail(input: {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    telegramUsername: string | null;
  };
  subject?: string;
  message: string;
}): Promise<boolean> {
  const topic = input.subject?.trim() || 'Без темы';
  const userName = input.user.displayName?.trim() || 'Без имени';
  const userEmail = input.user.email || 'нет email';
  const telegram = input.user.telegramUsername
    ? `@${input.user.telegramUsername}`
    : 'нет';
  const subject = `Гласно · Поддержка: ${topic}`;
  const text = `Новое обращение в поддержку Гласно

Тема: ${topic}
Пользователь: ${userName}
Email: ${userEmail}
Telegram: ${telegram}
ID: ${input.user.id}

Сообщение:
${input.message}`;
  const html = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f4fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#191b2e;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e4e5ef;border-radius:20px;">
            <tr>
              <td style="padding:30px 32px 12px;font-size:18px;font-weight:800;color:#5d4ee8;">Гласно · Поддержка</td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:#191b2e;">${escapeHtml(topic)}</h1>
                <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#4f526b;">Пользователь: <strong style="color:#191b2e;">${escapeHtml(userName)}</strong></p>
                <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#4f526b;">Email: ${escapeHtml(userEmail)}</p>
                <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#4f526b;">Telegram: ${escapeHtml(telegram)}</p>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4f526b;">ID: ${escapeHtml(input.user.id)}</p>
                <p style="margin:0;padding:16px;border:1px solid #e4e5ef;border-radius:12px;font-size:15px;line-height:1.6;color:#191b2e;white-space:pre-wrap;">${escapeHtml(input.message)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
  return await sendSmtpEmail({
    to: getSupportEmail(),
    subject,
    text,
    html,
    ...(input.user.email ? { replyTo: input.user.email } : {}),
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

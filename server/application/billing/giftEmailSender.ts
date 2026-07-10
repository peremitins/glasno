import { sendSmtpEmail } from '@/server/infrastructure/email/smtpEmailSender';

export async function sendGiftNotificationEmail(input: {
  to: string;
  senderName: string;
  planName: string;
  claimExpiresAt: Date;
  loginUrl: string;
}): Promise<boolean> {
  const deadline = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(input.claimExpiresAt);
  const subject = 'Вам подарили доступ к Гласно';
  const text = `Для вас есть подарок в Гласно

${input.senderName} дарит вам тариф ${input.planName} в Гласно. Здесь можно потренироваться перед собеседованием и получить разбор своих ответов.

Чтобы забрать подарок, войдите с адресом, на который пришло это письмо. Срок тарифа начнётся в момент первого входа, поэтому оплаченные дни не пропадут.

Подарок можно активировать до ${deadline}

Забрать подарок: ${input.loginUrl}

Если вы не ожидали это письмо, ничего делать не нужно.`;
  const html = `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.senderName)} дарит вам тариф ${escapeHtml(input.planName)} в Гласно.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f4fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#191b2e;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e4e5ef;border-radius:20px;">
            <tr>
              <td style="padding:30px 32px 12px;font-size:18px;font-weight:800;color:#5d4ee8;">Гласно</td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px;">
                <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#191b2e;">Для вас есть подарок</h1>
                <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#4f526b;"><strong style="color:#191b2e;">${escapeHtml(input.senderName)}</strong> дарит вам тариф ${escapeHtml(input.planName)} в Гласно. Здесь можно потренироваться перед собеседованием и получить разбор своих ответов.</p>
                <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#4f526b;">Чтобы забрать подарок, войдите с адресом, на который пришло это письмо. Срок тарифа начнётся в момент первого входа, поэтому оплаченные дни не пропадут.</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4f526b;">Подарок можно активировать до <strong style="color:#191b2e;">${escapeHtml(deadline)}</strong></p>
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="border-radius:12px;background:#5d4ee8;">
                      <a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;">Забрать подарок</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#767990;">Если кнопка не открывается, скопируйте ссылку:<br><a href="${escapeHtml(input.loginUrl)}" style="color:#5d4ee8;word-break:break-all;">${escapeHtml(input.loginUrl)}</a></p>
                <p style="margin:20px 0 0;padding-top:20px;border-top:1px solid #e4e5ef;font-size:13px;line-height:1.55;color:#767990;">Если вы не ожидали это письмо, ничего делать не нужно.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
  return await sendSmtpEmail({ to: input.to, subject, text, html });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

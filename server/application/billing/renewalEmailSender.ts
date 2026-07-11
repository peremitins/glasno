import { sendSmtpEmail } from '@/server/infrastructure/email/smtpEmailSender';

const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

const PRICE_FORMAT = new Intl.NumberFormat('ru-RU');

// Предуведомление о предстоящем автосписании (ТЗ тарифы v2, раздел 3):
// прозрачность списаний и защита от чарджбеков.
export async function sendRenewalNoticeEmail(input: {
  to: string;
  planName: string;
  amountRub: number;
  chargeAt: Date;
  pricingUrl: string;
}): Promise<boolean> {
  const date = DATE_FORMAT.format(input.chargeAt);
  const amount = PRICE_FORMAT.format(input.amountRub);
  const subject = `Гласно: продление доступа ${date}`;
  const text = `Напоминаем о продлении доступа в Гласно

${date} мы автоматически продлим «${input.planName}» и спишем ${amount} ₽ с привязанной карты.

Если продление не нужно, отключите его в настройках до даты списания — доступ сохранится до конца оплаченного срока: ${input.pricingUrl}

Если всё в порядке, ничего делать не нужно.`;
  const html = renewalEmailHtml({
    title: 'Напоминаем о продлении доступа',
    paragraphs: [
      `${escapeHtml(date)} мы автоматически продлим «${escapeHtml(input.planName)}» и спишем <strong style="color:#191b2e;">${escapeHtml(amount)} ₽</strong> с привязанной карты.`,
      'Если продление не нужно, отключите его в настройках до даты списания — доступ сохранится до конца оплаченного срока.',
      'Если всё в порядке, ничего делать не нужно.',
    ],
    ctaLabel: 'Управлять автопродлением',
    ctaUrl: input.pricingUrl,
  });
  return await sendSmtpEmail({ to: input.to, subject, text, html });
}

// Финальная неудача автосписания: автопродление выключено, пользователю
// нужен явный CTA обновить карту и продлить вручную.
export async function sendRenewalFailedEmail(input: {
  to: string;
  planName: string;
  amountRub: number;
  pricingUrl: string;
}): Promise<boolean> {
  const amount = PRICE_FORMAT.format(input.amountRub);
  const subject = 'Гласно: не удалось продлить доступ';
  const text = `Не удалось продлить доступ в Гласно

Мы не смогли списать ${amount} ₽ за продление «${input.planName}» с привязанной карты, поэтому автопродление выключено. Доступ останется активным до конца оплаченного срока.

Чтобы продолжить тренировки без перерыва, обновите карту и продлите доступ: ${input.pricingUrl}`;
  const html = renewalEmailHtml({
    title: 'Не удалось продлить доступ',
    paragraphs: [
      `Мы не смогли списать <strong style="color:#191b2e;">${escapeHtml(amount)} ₽</strong> за продление «${escapeHtml(input.planName)}» с привязанной карты, поэтому автопродление выключено.`,
      'Доступ останется активным до конца оплаченного срока.',
      'Чтобы продолжить тренировки без перерыва, обновите карту и продлите доступ.',
    ],
    ctaLabel: 'Продлить доступ',
    ctaUrl: input.pricingUrl,
  });
  return await sendSmtpEmail({ to: input.to, subject, text, html });
}

function renewalEmailHtml(input: {
  title: string;
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
}): string {
  const paragraphs = input.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#4f526b;">${paragraph}</p>`
    )
    .join('\n');
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f4fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#191b2e;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e4e5ef;border-radius:20px;">
            <tr>
              <td style="padding:30px 32px 12px;font-size:18px;font-weight:800;color:#5d4ee8;">Гласно</td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px;">
                <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#191b2e;">${input.title}</h1>
                ${paragraphs}
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="border-radius:12px;background:#5d4ee8;">
                      <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;">${input.ctaLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

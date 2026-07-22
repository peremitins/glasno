import { sendSmtpEmail } from '@/server/infrastructure/email/smtpEmailSender';

const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

const PRICE_FORMAT = new Intl.NumberFormat('ru-RU');

// Предуведомление о предстоящем автосписании (ТЗ тарифы v2, раздел 3):
// прозрачность списаний и защита от чарджбеков. Шлём только длинным
// пропускам — см. resolveRenewalNoticeLeadMs. Тон письма — про сохранение
// доступа, а не про отмену: отписка доступна, но не выносится в заголовок.
export async function sendRenewalNoticeEmail(input: {
  to: string;
  planName: string;
  amountRub: number;
  chargeAt: Date;
  pricingUrl: string;
}): Promise<boolean> {
  const date = DATE_FORMAT.format(input.chargeAt);
  const amount = PRICE_FORMAT.format(input.amountRub);
  const subject = `Гласно: доступ продлится ${date}`;
  const text = `Доступ продлится автоматически

${date} мы продлим «${input.planName}» и спишем ${amount} ₽ с сохранённого способа оплаты.

Интервью, разборы и PDF-отчёты останутся доступны без перерыва. Делать ничего не нужно.

Отключить автопродление можно в настройках. Тогда доступ сохранится до конца оплаченного срока: ${input.pricingUrl}`;
  const html = renewalEmailHtml({
    title: 'Доступ продлится автоматически',
    paragraphs: [
      `${escapeHtml(date)} мы продлим «${escapeHtml(input.planName)}» и спишем <strong style="color:#191b2e;">${escapeHtml(amount)} ₽</strong> с сохранённого способа оплаты.`,
      'Интервью, разборы и PDF-отчёты останутся доступны без перерыва. Делать ничего не нужно.',
    ],
    ctaLabel: 'Открыть Гласно',
    ctaUrl: input.pricingUrl,
    footnote:
      'Отключить автопродление можно в настройках. Тогда доступ сохранится до конца оплаченного срока.',
  });
  return await sendSmtpEmail({ to: input.to, subject, text, html });
}

// Подтверждение состоявшегося продления. Шлём всегда, независимо от срока
// пропуска: это ожидаемый документ, который снимает большую часть вопросов
// «что за списание» — и он дешевле чарджбека.
export async function sendRenewalChargedEmail(input: {
  to: string;
  planName: string;
  amountRub: number;
  accessUntil: Date;
  pricingUrl: string;
}): Promise<boolean> {
  const until = DATE_FORMAT.format(input.accessUntil);
  const amount = PRICE_FORMAT.format(input.amountRub);
  const subject = `Гласно: доступ продлён до ${until}`;
  const text = `Доступ продлён

Мы продлили «${input.planName}» и списали ${amount} ₽ с сохранённого способа оплаты. Доступ активен до ${until}.

Фискальный чек придёт отдельным письмом от платёжного сервиса.

Отключить автопродление можно в настройках: ${input.pricingUrl}`;
  const html = renewalEmailHtml({
    title: 'Доступ продлён',
    paragraphs: [
      `Мы продлили «${escapeHtml(input.planName)}» и списали <strong style="color:#191b2e;">${escapeHtml(amount)} ₽</strong> с сохранённого способа оплаты.`,
      `Доступ активен до <strong style="color:#191b2e;">${escapeHtml(until)}</strong>.`,
    ],
    ctaLabel: 'Продолжить тренировки',
    ctaUrl: input.pricingUrl,
    footnote:
      'Фискальный чек придёт отдельным письмом от платёжного сервиса. Отключить автопродление можно в настройках.',
  });
  return await sendSmtpEmail({ to: input.to, subject, text, html });
}

// Финальная неудача автосписания: автопродление выключено, пользователю
// нужен явный CTA обновить способ оплаты и продлить вручную.
export async function sendRenewalFailedEmail(input: {
  to: string;
  planName: string;
  amountRub: number;
  pricingUrl: string;
}): Promise<boolean> {
  const amount = PRICE_FORMAT.format(input.amountRub);
  const subject = 'Гласно: не удалось продлить доступ';
  const text = `Не удалось продлить доступ в Гласно

Мы не смогли списать ${amount} ₽ за продление «${input.planName}» с сохранённого способа оплаты, поэтому автопродление выключено. Доступ сохранится до конца оплаченного срока.

Чтобы продолжить тренировки без перерыва, обновите способ оплаты и продлите доступ: ${input.pricingUrl}`;
  const html = renewalEmailHtml({
    title: 'Не удалось продлить доступ',
    paragraphs: [
      `Мы не смогли списать <strong style="color:#191b2e;">${escapeHtml(amount)} ₽</strong> за продление «${escapeHtml(input.planName)}» с сохранённого способа оплаты, поэтому автопродление выключено.`,
      'Доступ сохранится до конца оплаченного срока.',
      'Чтобы продолжить тренировки без перерыва, обновите способ оплаты и продлите доступ.',
    ],
    ctaLabel: 'Продлить доступ',
    ctaUrl: input.pricingUrl,
  });
  return await sendSmtpEmail({ to: input.to, subject, text, html });
}

// Исход запроса к YooKassa неизвестен: предлагать ещё одну оплату опасно.
// Ведём пользователя в профиль к форме поддержки, а заказ оставляем в
// карантине до ручной сверки.
export async function sendRenewalManualReviewEmail(input: {
  to: string;
  planName: string;
  amountRub: number;
  profileUrl: string;
}): Promise<boolean> {
  const amount = PRICE_FORMAT.format(input.amountRub);
  const subject = 'Гласно: нужно проверить автосписание';
  const text = `Нужно проверить автосписание

Мы пока не смогли подтвердить, прошло ли списание ${amount} ₽ за продление «${input.planName}».

Чтобы не списать деньги повторно, мы остановили автопродление и временно закрыли новую покупку полного доступа. Напишите в поддержку в профиле — мы сверим платёж: ${input.profileUrl}`;
  const html = renewalEmailHtml({
    title: 'Нужно проверить автосписание',
    paragraphs: [
      `Мы пока не смогли подтвердить, прошло ли списание <strong style="color:#191b2e;">${escapeHtml(amount)} ₽</strong> за продление «${escapeHtml(input.planName)}».`,
      'Чтобы не списать деньги повторно, мы остановили автопродление и временно закрыли новую покупку полного доступа.',
      'Напишите в поддержку в профиле — мы сверим платёж.',
    ],
    ctaLabel: 'Открыть профиль',
    ctaUrl: input.profileUrl,
  });
  return await sendSmtpEmail({ to: input.to, subject, text, html });
}

function renewalEmailHtml(input: {
  title: string;
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  footnote?: string;
}): string {
  const paragraphs = input.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#4f526b;">${paragraph}</p>`
    )
    .join('\n');
  // Условия отмены — сноской под кнопкой: обязаны быть в письме, но не должны
  // конкурировать за внимание с основным сообщением.
  const footnote = input.footnote
    ? `<p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#8b8ea6;">${escapeHtml(input.footnote)}</p>`
    : '';
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
                ${footnote}
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

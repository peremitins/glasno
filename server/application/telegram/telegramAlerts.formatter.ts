export interface TelegramAlertUserInfo {
  id: string;
  email?: string | null;
  telegramId?: string | null;
  telegramUsername?: string | null;
  displayName?: string | null;
}

function formatUserIdentityLines(user: TelegramAlertUserInfo): string[] {
  const lines: string[] = [];
  if (user.displayName) lines.push(`Имя: ${user.displayName}`);
  if (user.email) lines.push(`Email: ${user.email}`);
  if (user.telegramUsername || user.telegramId) {
    const handle = user.telegramUsername ? `@${user.telegramUsername}` : '—';
    lines.push(`Telegram: ${handle} (id: ${user.telegramId ?? '—'})`);
  }
  lines.push(`ID пользователя: ${user.id}`);
  return lines;
}

export function formatUserRegisteredAlert(user: TelegramAlertUserInfo): string {
  return ['🆕 [glasno] Новый пользователь', ...formatUserIdentityLines(user)].join(
    '\n'
  );
}

export function formatUserDeletedAlert(user: TelegramAlertUserInfo): string {
  return ['🗑 [glasno] Удаление аккаунта', ...formatUserIdentityLines(user)].join(
    '\n'
  );
}

export function formatSubscriptionPurchasedAlert(params: {
  user: TelegramAlertUserInfo;
  planName: string;
  amountRub: number;
  isRenewal: boolean;
}): string {
  const title = params.isRenewal
    ? '🔄 [glasno] Автопродление подписки'
    : '💳 [glasno] Новая подписка';
  return [
    title,
    ...formatUserIdentityLines(params.user),
    `Тариф: ${params.planName}`,
    `Сумма: ${params.amountRub} ₽`,
  ].join('\n');
}

export function formatVoiceMinutesPurchasedAlert(params: {
  user: TelegramAlertUserInfo;
  planName: string;
  minutes: number;
  amountRub: number;
}): string {
  return [
    '🎙 [glasno] Докупка минут real-time voice',
    ...formatUserIdentityLines(params.user),
    `Пакет: ${params.planName} (+${params.minutes} мин)`,
    `Сумма: ${params.amountRub} ₽`,
  ].join('\n');
}

export function formatCriticalErrorAlert(params: {
  route: string;
  requestId?: string | null;
  message: string;
}): string {
  return [
    '🔥 [glasno] Критическая ошибка',
    `Route: ${params.route}`,
    params.requestId ? `Request-ID: ${params.requestId}` : null,
    `Ошибка: ${params.message}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

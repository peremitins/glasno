import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export interface TelegramLoginPayload {
  id: string | number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string | number;
  hash: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Провайдеры, у которых точки в локальной части адреса игнорируются:
// u.ser@gmail.com и user@gmail.com — один и тот же ящик.
const DOT_INSENSITIVE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

// Ключ бесплатной попытки. Отличается от normalizeEmail тем, что сводит к
// одному значению адреса, ведущие в один почтовый ящик: ivan+1@gmail.com,
// ivan+2@gmail.com и i.van@gmail.com — это один человек и один триал.
//
// ВАЖНО: идентичность при входе (normalizeEmail) так канонизировать нельзя —
// это склеило бы существующие аккаунты. Функция применяется только к истории
// триалов. Точки схлопываем строго для gmail: у Яндекса и mail.ru они
// значимы, и удаление сцепило бы разных людей.
export function canonicalizeEmailForTrial(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return normalized;

  let local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);

  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replaceAll('.', '');

  // Локальная часть из одних точек/плюса — оставляем адрес как есть, чтобы не
  // схлопнуть его в пустую строку и не выдать один ключ разным адресам.
  if (!local) return normalized;
  return `${local}@${domain}`;
}

export function hashEmail(email: string, pepper: string): string {
  return hmacHex(pepper, normalizeEmail(email));
}

export function hashEmailCode(
  normalizedEmail: string,
  code: string,
  secret: string
): string {
  return hmacHex(secret, `${normalizeEmail(normalizedEmail)}:${code.trim()}`);
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateNumericCode(length = 6): string {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += String(randomInt(0, 10));
  }
  return code;
}

export function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyTelegramLoginPayload(
  payload: TelegramLoginPayload,
  botToken: string,
  options: { nowSeconds?: number; maxAgeSeconds?: number } = {}
): boolean {
  if (!botToken || !payload.hash) return false;

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate) || authDate <= 0) return false;

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAgeSeconds = options.maxAgeSeconds ?? 60 * 60 * 24;
  if (nowSeconds - authDate > maxAgeSeconds) return false;

  const dataCheckString = Object.entries(payload)
    .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');

  return safeEqual(expected, payload.hash);
}

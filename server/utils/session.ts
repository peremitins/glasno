import { createHmac, timingSafeEqual } from 'node:crypto';
import { nanoid } from 'nanoid';
import type { H3Event } from 'h3';
import type { UserRole } from '@/shared/dto';

// Лёгкая АНОНИМНАЯ сессия (до полноценной авторизации, Фаза 4).
// В cookie кладём `${id}.${hmac}`, подписанный NUXT_SESSION_SECRET.
// Это позволяет привязывать интервью/отчёты к пользователю без логина,
// а позже — смигрировать анонимные данные на реальный аккаунт.

const COOKIE_NAME = 'glasno_sid';
const MAX_AGE = 60 * 60 * 24 * 365; // 1 год

export interface SessionContext {
  id: string;
  isAnonymous: boolean;
  fresh: boolean; // создана только что в этом запросе
  userId?: string | null;
  role?: UserRole | null;
  authSessionId?: string | null;
}

function sign(id: string, secret: string): string {
  return createHmac('sha256', secret).update(id).digest('hex');
}

function verify(id: string, sig: string, secret: string): boolean {
  const expected = sign(id, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getOrCreateAnonSession(event: H3Event): SessionContext {
  const secret = useRuntimeConfig(event).sessionSecret as string;
  if (!secret) {
    throw new Error('NUXT_SESSION_SECRET is not set');
  }

  const raw = getCookie(event, COOKIE_NAME);
  if (raw) {
    const dot = raw.lastIndexOf('.');
    if (dot > 0) {
      const id = raw.slice(0, dot);
      const sig = raw.slice(dot + 1);
      if (id && sig && verify(id, sig, secret)) {
        return { id, isAnonymous: true, fresh: false };
      }
    }
  }

  // Невалидная/отсутствующая cookie — создаём новую сессию.
  const id = nanoid();
  const value = `${id}.${sign(id, secret)}`;
  setCookie(event, COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });

  return { id, isAnonymous: true, fresh: true };
}

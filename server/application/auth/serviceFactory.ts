import type { H3Event } from 'h3';
import { DrizzleAuthRepository } from '@/server/infrastructure/auth/drizzleAuthRepository';
import { apiError } from '@/server/utils/errors';
import { AuthService } from './authService';
import { AuthSessionService } from './authSessionService';

function getSessionSecret(event: H3Event): string {
  const config = useRuntimeConfig(event);
  const sessionSecret = config.sessionSecret as string;
  if (!sessionSecret) {
    throw apiError('E_UPSTREAM', 'NUXT_SESSION_SECRET не задан');
  }
  return sessionSecret;
}

export function createAuthRepository() {
  return new DrizzleAuthRepository();
}

export function createAuthSessionService(event: H3Event) {
  const repository = createAuthRepository();
  return new AuthSessionService({
    repository,
    sessionSecret: getSessionSecret(event),
  });
}

export function createAuthService(event: H3Event) {
  const config = useRuntimeConfig(event);
  const repository = createAuthRepository();
  const sessionService = new AuthSessionService({
    repository,
    sessionSecret: getSessionSecret(event),
  });

  return new AuthService({
    repository,
    sessionService,
    authEmailCodeSecret:
      (config.authEmailCodeSecret as string) ||
      process.env.AUTH_EMAIL_CODE_SECRET ||
      '',
    emailHashPepper:
      (config.emailHashPepper as string) || process.env.EMAIL_HASH_PEPPER || '',
    telegramBotToken: config.telegramBotToken as string,
    exposeDevCode: process.env.NODE_ENV !== 'production',
    adminEmails: parseCsvEnv(process.env.ADMIN_EMAILS),
    adminTelegramIds: parseCsvEnv(process.env.ADMIN_TELEGRAM_IDS),
  });
}

function parseCsvEnv(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

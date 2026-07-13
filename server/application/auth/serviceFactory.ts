import type { H3Event } from 'h3';
import { DrizzleAuthRepository } from '@/server/infrastructure/auth/drizzleAuthRepository';
import { normalizeAvatarImage } from '@/server/infrastructure/files/normalizeAvatarImage';
import {
  resolveS3AvatarStorageConfig,
  S3AvatarStorage,
} from '@/server/infrastructure/storage/s3AvatarStorage';
import { apiError } from '@/server/utils/errors';
import { createTelegramAlertsService } from '@/server/application/telegram/serviceFactory';
import { AuthService } from './authService';
import { AuthSessionService } from './authSessionService';

let cachedAvatarStorage:
  | { key: string; storage: S3AvatarStorage }
  | undefined;

// S3-клиент хранит keep-alive соединения. Кэш живёт на уровне Nitro-процесса,
// а не отдельного HTTP-запроса, чтобы не создавать новый клиент для каждой
// операции с аватаром.
export function getCachedAvatarStorage(
  runtimeConfig: Record<string, unknown>
): S3AvatarStorage {
  const storageConfig = resolveS3AvatarStorageConfig(runtimeConfig);
  const key = JSON.stringify([
    storageConfig.endpoint,
    storageConfig.region,
    storageConfig.bucket,
    storageConfig.accessKeyId,
    storageConfig.secretAccessKey,
  ]);

  if (cachedAvatarStorage?.key === key) {
    return cachedAvatarStorage.storage;
  }

  // При смене настроек не оставляем открытые сокеты предыдущего клиента.
  cachedAvatarStorage?.storage.destroy();
  const storage = new S3AvatarStorage(storageConfig);
  cachedAvatarStorage = { key, storage };
  return storage;
}

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
    testLoginEmails: parseCsvEnv(process.env.AUTH_TEST_LOGIN_EMAILS),
    testLoginCode: process.env.AUTH_TEST_LOGIN_CODE || '',
    avatarImageProcessor: { normalize: normalizeAvatarImage },
    createAvatarStorage: () =>
      getCachedAvatarStorage(config as Record<string, unknown>),
    telegramAlerts: createTelegramAlertsService(event),
  });
}

function parseCsvEnv(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

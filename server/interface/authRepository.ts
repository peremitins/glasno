import type { UserRole } from '@/shared/dto';

export interface AuthUserRecord {
  id: string;
  email: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
  displayName: string | null;
  avatarVersion: string | null;
  role: UserRole;
  onboarding: Record<string, unknown>;
  emailVerifiedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailLoginCodeRecord {
  id: string;
  emailHash: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
}

export interface MagicLoginTokenRecord {
  id: string;
  telegramId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface CreateEmailLoginCodeInput {
  emailHash: string;
  codeHash: string;
  expiresAt: Date;
}

export interface CreateAuthSessionInput {
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
}

export interface UpsertTelegramUserInput {
  telegramId: string;
  telegramUsername?: string | null;
  displayName?: string | null;
}

export interface UpsertEmailUserInput {
  email: string;
  displayName?: string | null;
}

// isNew: true — только если этим вызовом создана новая строка users (не при
// повторном входе); используется, чтобы не слать Telegram-алерт регистрации
// на каждый логин.
export interface UpsertUserResult {
  user: AuthUserRecord;
  isNew: boolean;
}

export interface CreateMagicLoginTokenInput {
  telegramId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthRepository {
  // Сериализует операции с одним детерминированным S3-ключом аватара даже
  // между несколькими приложениями/blue-green репликами.
  withUserAvatarLock<T>(
    userId: string,
    callback: (repository: AuthRepository) => Promise<T>
  ): Promise<T>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  findUserByTelegramId(telegramId: string): Promise<AuthUserRecord | null>;
  upsertEmailUser(input: UpsertEmailUserInput): Promise<UpsertUserResult>;
  upsertTelegramUser(input: UpsertTelegramUserInput): Promise<UpsertUserResult>;
  updateDisplayName(
    userId: string,
    displayName: string | null
  ): Promise<AuthUserRecord | null>;
  setAvatarVersion(
    userId: string,
    avatarVersion: string | null
  ): Promise<AuthUserRecord | null>;
  setUserRole(userId: string, role: UserRole): Promise<AuthUserRecord>;
  anonymizeUserAccount(userId: string, now: Date): Promise<boolean>;

  createEmailLoginCode(
    input: CreateEmailLoginCodeInput
  ): Promise<EmailLoginCodeRecord>;
  findActiveEmailLoginCode(
    emailHash: string,
    now: Date
  ): Promise<EmailLoginCodeRecord | null>;
  incrementEmailLoginCodeAttempts(id: string): Promise<void>;
  consumeEmailLoginCode(id: string): Promise<void>;

  migrateAnonymousSessionsToUser(
    anonymousSessionId: string,
    userId: string
  ): Promise<number>;

  createAuthSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord>;
  findAuthSessionById(id: string): Promise<AuthSessionRecord | null>;
  touchAuthSession(id: string): Promise<void>;
  revokeAuthSession(id: string): Promise<void>;

  createMagicLoginToken(
    input: CreateMagicLoginTokenInput
  ): Promise<MagicLoginTokenRecord>;
  consumeMagicLoginToken(
    tokenHash: string,
    now: Date
  ): Promise<MagicLoginTokenRecord | null>;
}

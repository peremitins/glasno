import { randomUUID } from 'node:crypto';
import type {
  DeleteAccountResponse,
  AuthLoginResponse,
  AuthUser,
  EmailLoginStartResponse,
  TelegramLoginRequest,
} from '@/shared/dto';
import type {
  AuthRepository,
  AuthUserRecord,
} from '@/server/interface/authRepository';
import type {
  AvatarImageProcessor,
  AvatarStorage,
} from '@/server/interface/avatarStorage';
import { apiError, isApiError } from '@/server/utils/errors';
import {
  createOpaqueToken,
  generateNumericCode,
  hashEmail,
  hashEmailCode,
  hashOpaqueToken,
  normalizeEmail,
  safeEqual,
  verifyTelegramLoginPayload,
} from './authCrypto';
import type { AuthSessionService } from './authSessionService';
import { sendLoginCodeEmail } from './emailSender';

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const MAGIC_LOGIN_TTL_MS = 10 * 60 * 1000;
const MAX_EMAIL_CODE_ATTEMPTS = 5;

export interface AuthLoginResult extends AuthLoginResponse {
  cookieValue: string;
  csrfToken: string;
}

export interface CreatedMagicLoginToken {
  token: string;
  expiresAt: Date;
}

interface AvatarSnapshot {
  version: string | null;
  data: Buffer | null;
}

interface AvatarMutationState {
  snapshot: AvatarSnapshot | null;
  storageOperationAttempted: boolean;
  innerCompensationAttempted: boolean;
  callbackCompleted: boolean;
}

export class AuthService {
  constructor(
    private readonly deps: {
      repository: AuthRepository;
      sessionService: AuthSessionService;
      authEmailCodeSecret: string;
      emailHashPepper: string;
      telegramBotToken: string;
      exposeDevCode?: boolean;
      // Allowlist для авто-выдачи роли admin при входе.
      adminEmails?: string[];
      adminTelegramIds?: string[];
      // Allowlist тестовых входов: фиксированный код без отправки письма.
      testLoginEmails?: string[];
      testLoginCode?: string;
      // Фабрика создаёт S3-клиент только в avatar-операциях, поэтому
      // не настроенное хранилище не блокирует обычную авторизацию.
      createAvatarStorage?: () => AvatarStorage;
      avatarImageProcessor?: AvatarImageProcessor;
      createAvatarVersion?: () => string;
    }
  ) {}

  async startEmailLogin(params: {
    email: string;
  }): Promise<EmailLoginStartResponse> {
    this.assertEmailSecrets();

    const email = normalizeEmail(params.email);
    const testLoginCode = this.resolveTestLoginCode(email);
    const code = testLoginCode ?? generateNumericCode(6);
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);

    await this.deps.repository.createEmailLoginCode({
      emailHash: hashEmail(email, this.deps.emailHashPepper),
      codeHash: hashEmailCode(email, code, this.deps.authEmailCodeSecret),
      expiresAt,
    });

    if (!testLoginCode) {
      // Отправляем код на почту (не фатально: в dev код также виден на экране).
      await sendLoginCodeEmail(email, code);
    }

    return {
      ok: true,
      expiresAt: expiresAt.toISOString(),
      ...(this.deps.exposeDevCode ? { devCode: code } : {}),
    };
  }

  async verifyEmailLogin(params: {
    email: string;
    code: string;
    displayName?: string;
    anonymousSessionId: string;
  }): Promise<AuthLoginResult> {
    this.assertEmailSecrets();

    const email = normalizeEmail(params.email);
    const now = new Date();
    const emailHash = hashEmail(email, this.deps.emailHashPepper);
    const codeRecord = await this.deps.repository.findActiveEmailLoginCode(
      emailHash,
      now
    );
    if (!codeRecord || codeRecord.attempts >= MAX_EMAIL_CODE_ATTEMPTS) {
      throw apiError('E_AUTH', 'Код не найден или истёк');
    }

    const expectedHash = hashEmailCode(
      email,
      params.code,
      this.deps.authEmailCodeSecret
    );
    if (!safeEqual(codeRecord.codeHash, expectedHash)) {
      await this.deps.repository.incrementEmailLoginCodeAttempts(codeRecord.id);
      throw apiError('E_AUTH', 'Неверный код');
    }

    await this.deps.repository.consumeEmailLoginCode(codeRecord.id);
    const user = await this.deps.repository.upsertEmailUser({
      email,
      displayName: normalizeDisplayName(params.displayName),
    });
    return this.finishLogin(user, params.anonymousSessionId);
  }

  async verifyTelegramLogin(params: {
    payload: TelegramLoginRequest;
    anonymousSessionId: string;
  }): Promise<AuthLoginResult> {
    if (!this.deps.telegramBotToken) {
      throw apiError('E_UPSTREAM', 'NUXT_TELEGRAM_BOT_TOKEN не задан');
    }

    if (
      !verifyTelegramLoginPayload(params.payload, this.deps.telegramBotToken)
    ) {
      throw apiError('E_AUTH', 'Подпись Telegram не прошла проверку');
    }

    const telegramId = String(params.payload.id);
    const displayName = [params.payload.first_name, params.payload.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    const user = await this.deps.repository.upsertTelegramUser({
      telegramId,
      telegramUsername: params.payload.username ?? null,
      displayName: displayName || params.payload.username || null,
    });

    return this.finishLogin(user, params.anonymousSessionId);
  }

  async createMagicLoginToken(
    telegramId: string
  ): Promise<CreatedMagicLoginToken> {
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + MAGIC_LOGIN_TTL_MS);
    await this.deps.repository.createMagicLoginToken({
      telegramId,
      tokenHash: hashOpaqueToken(token),
      expiresAt,
    });
    return { token, expiresAt };
  }

  async consumeMagicLogin(params: {
    token: string;
    anonymousSessionId: string;
  }): Promise<AuthLoginResult> {
    const record = await this.deps.repository.consumeMagicLoginToken(
      hashOpaqueToken(params.token),
      new Date()
    );
    if (!record) {
      throw apiError('E_AUTH', 'Magic-link недействителен или истёк');
    }

    const existing = await this.deps.repository.findUserByTelegramId(
      record.telegramId
    );
    const user =
      existing ??
      (await this.deps.repository.upsertTelegramUser({
        telegramId: record.telegramId,
      }));

    return this.finishLogin(user, params.anonymousSessionId);
  }

  async deleteAccount(userId: string): Promise<DeleteAccountResponse> {
    const mutation = this.createAvatarMutationState();
    try {
      return await this.deps.repository.withUserAvatarLock(
        userId,
        async (repository) => {
          // Не полагаемся на устаревший auth context: сначала читаем актуальную
          // запись, чтобы удалить её приватный объект до анонимизации аккаунта.
          const user = await this.requireActiveUser(repository, userId);
          mutation.snapshot = await this.captureAvatarSnapshot(user);

          // Ключ детерминирован, поэтому удаляем его даже при avatarVersion = null:
          // это дочищает объект после сбоя записи версии или предыдущего cleanup.
          // S3 DeleteObject идемпотентен; ошибка хранилища не даёт анонимизировать
          // пользователя и тем самым оставить приватное фото без владельца.
          try {
            mutation.storageOperationAttempted = true;
            await this.withAvatarStorage((storage) =>
              storage.deleteAvatar(user.id)
            );

            const deleted = await repository.anonymizeUserAccount(
              userId,
              new Date()
            );
            if (!deleted) {
              throw apiError('E_NOT_FOUND', 'Аккаунт не найден');
            }
            mutation.callbackCompleted = true;
            return { ok: true };
          } catch (error) {
            await this.compensateAvatarMutationInLock(userId, mutation);
            throw error;
          }
        }
      );
    } catch (error) {
      await this.compensateAvatarCommitFailure(userId, mutation);
      throw error;
    }
  }

  async updateProfile(
    userId: string,
    displayName: string | null
  ): Promise<AuthUser> {
    const updated = await this.deps.repository.updateDisplayName(
      userId,
      normalizeDisplayName(displayName)
    );
    if (!updated) {
      throw apiError('E_NOT_FOUND', 'Аккаунт не найден');
    }
    return toAuthUserDto(updated);
  }

  async uploadAvatar(
    userId: string,
    input: { data: Buffer; mimeType: string | null }
  ): Promise<AuthUser> {
    const processor = this.deps.avatarImageProcessor;
    if (!processor) {
      throw apiError('E_UPSTREAM', 'Обработчик аватаров не настроен');
    }
    // Декодирование CPU-bound и не меняет состояние пользователя, поэтому не
    // удерживаем транзакционную блокировку строки во время обработки изображения.
    const avatar = await processor.normalize(input.data, input.mimeType);

    const mutation = this.createAvatarMutationState();
    try {
      return await this.deps.repository.withUserAvatarLock(
        userId,
        async (repository) => {
          const user = await this.requireActiveUser(repository, userId);
          mutation.snapshot = await this.captureAvatarSnapshot(user);

          try {
            mutation.storageOperationAttempted = true;
            await this.withAvatarStorage((storage) =>
              storage.putAvatar(userId, avatar)
            );
            const updated = await repository.setAvatarVersion(
              userId,
              (this.deps.createAvatarVersion ?? randomUUID)()
            );
            if (!updated) {
              throw apiError('E_NOT_FOUND', 'Аккаунт не найден');
            }
            mutation.callbackCompleted = true;
            return toAuthUserDto(updated);
          } catch (error) {
            await this.compensateAvatarMutationInLock(userId, mutation);
            throw error;
          }
        }
      );
    } catch (error) {
      await this.compensateAvatarCommitFailure(userId, mutation);
      throw error;
    }
  }

  async deleteAvatar(userId: string): Promise<AuthUser> {
    const mutation = this.createAvatarMutationState();
    try {
      return await this.deps.repository.withUserAvatarLock(
        userId,
        async (repository) => {
          const user = await this.requireActiveUser(repository, userId);
          mutation.snapshot = await this.captureAvatarSnapshot(user);
          try {
            if (user.avatarVersion) {
              mutation.storageOperationAttempted = true;
              await this.withAvatarStorage((storage) =>
                storage.deleteAvatar(user.id)
              );
            }

            const updated = await repository.setAvatarVersion(userId, null);
            if (!updated) {
              throw apiError('E_NOT_FOUND', 'Аккаунт не найден');
            }
            mutation.callbackCompleted = true;
            return toAuthUserDto(updated);
          } catch (error) {
            await this.compensateAvatarMutationInLock(userId, mutation);
            throw error;
          }
        }
      );
    } catch (error) {
      await this.compensateAvatarCommitFailure(userId, mutation);
      throw error;
    }
  }

  async getAvatar(
    userId: string,
    avatarVersion: string | null
  ): Promise<Buffer> {
    return this.deps.repository.withUserAvatarLock(
      userId,
      async (repository) => {
        const user = await this.requireActiveUser(repository, userId);
        if (!user.avatarVersion || avatarVersion !== user.avatarVersion) {
          throw apiError('E_NOT_FOUND', 'Аватар не установлен');
        }

        const avatar = await this.withAvatarStorage((storage) =>
          storage.getAvatar(user.id)
        );
        if (!avatar) {
          throw apiError('E_NOT_FOUND', 'Аватар не найден');
        }
        return avatar;
      }
    );
  }

  private async finishLogin(
    user: AuthUserRecord,
    anonymousSessionId: string
  ): Promise<AuthLoginResult> {
    const promoted = await this.ensureAdminRole(user);

    // Переносим историю и персональные настройки вопросов до выдачи auth-cookie:
    // после входа чтение идёт уже по userId, и данные гостя должны быть доступны
    // в том же ответе/следующем запросе.
    await this.deps.repository.migrateAnonymousSessionsToUser(
      anonymousSessionId,
      promoted.id
    );

    const createdSession = await this.deps.sessionService.createForUser(
      promoted.id
    );
    return {
      ok: true,
      user: toAuthUserDto(promoted),
      cookieValue: createdSession.cookieValue,
      csrfToken: createdSession.csrfToken,
    };
  }

  // Авто-выдача роли admin пользователям из allowlist (env ADMIN_EMAILS /
  // ADMIN_TELEGRAM_IDS). У admin нет лимитов на использование AI.
  private async ensureAdminRole(user: AuthUserRecord): Promise<AuthUserRecord> {
    if (user.role === 'admin') return user;

    const emails = (this.deps.adminEmails ?? []).map((e) => e.toLowerCase());
    const telegramIds = this.deps.adminTelegramIds ?? [];
    const isAdmin =
      (user.email && emails.includes(user.email.toLowerCase())) ||
      (user.telegramId && telegramIds.includes(user.telegramId));

    if (!isAdmin) return user;
    return this.deps.repository.setUserRole(user.id, 'admin');
  }

  private async requireActiveUser(
    repository: Pick<AuthRepository, 'findUserById'>,
    userId: string
  ): Promise<AuthUserRecord> {
    const user = await repository.findUserById(userId);
    if (!user) {
      throw apiError('E_NOT_FOUND', 'Аккаунт не найден');
    }
    return user;
  }

  private createAvatarMutationState(): AvatarMutationState {
    return {
      snapshot: null,
      storageOperationAttempted: false,
      innerCompensationAttempted: false,
      callbackCompleted: false,
    };
  }

  private async captureAvatarSnapshot(
    user: AuthUserRecord
  ): Promise<AvatarSnapshot> {
    return {
      version: user.avatarVersion,
      data: user.avatarVersion
        ? await this.withAvatarStorage((storage) => storage.getAvatar(user.id))
        : null,
    };
  }

  private async compensateAvatarMutationInLock(
    userId: string,
    mutation: AvatarMutationState
  ): Promise<void> {
    if (!mutation.snapshot || !mutation.storageOperationAttempted) return;

    mutation.innerCompensationAttempted = true;
    try {
      await this.restoreAvatarSnapshot(userId, mutation.snapshot);
    } catch {
      // При двойном сбое S3 сохраняем первичную ошибку операции.
    }
  }

  private async compensateAvatarCommitFailure(
    userId: string,
    mutation: AvatarMutationState
  ): Promise<void> {
    const snapshot = mutation.snapshot;
    if (
      !snapshot ||
      !mutation.callbackCompleted ||
      mutation.innerCompensationAttempted
    ) {
      return;
    }

    try {
      // Ошибка commit может означать как rollback, так и успешный commit с
      // потерянным ответом. Новый lock позволяет компенсировать только rollback:
      // если версия уже изменилась или аккаунт удалён, чужое актуальное состояние
      // не перезаписываем.
      await this.deps.repository.withUserAvatarLock(userId, async (repository) => {
        const current = await repository.findUserById(userId);
        if (!current || current.avatarVersion !== snapshot.version) return;
        await this.restoreAvatarSnapshot(userId, snapshot);
      });
    } catch {
      // Компенсация после неопределённого commit — best effort.
    }
  }

  private async restoreAvatarSnapshot(
    userId: string,
    snapshot: AvatarSnapshot
  ): Promise<void> {
    if (snapshot.data !== null) {
      await this.withAvatarStorage((storage) =>
        storage.putAvatar(userId, snapshot.data!)
      );
      return;
    }
    await this.withAvatarStorage((storage) => storage.deleteAvatar(userId));
  }

  private async withAvatarStorage<T>(
    action: (storage: AvatarStorage) => Promise<T>
  ): Promise<T> {
    const createAvatarStorage = this.deps.createAvatarStorage;
    if (!createAvatarStorage) {
      throw apiError('E_UPSTREAM', 'Хранилище аватаров не настроено');
    }

    try {
      return await action(createAvatarStorage());
    } catch (error) {
      if (isApiError(error)) throw error;
      throw apiError('E_UPSTREAM', 'Хранилище аватаров временно недоступно');
    }
  }

  private assertEmailSecrets() {
    if (!this.deps.authEmailCodeSecret) {
      throw apiError('E_UPSTREAM', 'AUTH_EMAIL_CODE_SECRET не задан');
    }
    if (!this.deps.emailHashPepper) {
      throw apiError('E_UPSTREAM', 'EMAIL_HASH_PEPPER не задан');
    }
  }

  private resolveTestLoginCode(email: string): string | null {
    const testLoginCode = this.deps.testLoginCode?.trim();
    if (!testLoginCode || !/^\d{6}$/.test(testLoginCode)) return null;

    const testLoginEmails = (this.deps.testLoginEmails ?? []).map((item) =>
      normalizeEmail(item)
    );
    return testLoginEmails.includes(email) ? testLoginCode : null;
  }
}

export function toAuthUserDto(user: AuthUserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername,
    displayName: user.displayName,
    avatarUrl: user.avatarVersion
      ? `/api/auth/profile/avatar?v=${encodeURIComponent(user.avatarVersion)}`
      : null,
    role: user.role,
    onboarding: {
      interviewExplainSelection: Boolean(
        user.onboarding.interviewExplainSelection
      ),
    },
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

function normalizeDisplayName(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}

export function pickLoginResponse(result: AuthLoginResult): AuthLoginResponse {
  return { ok: true, user: result.user };
}

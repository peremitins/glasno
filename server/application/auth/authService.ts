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
import { apiError } from '@/server/utils/errors';
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
    }
  ) {}

  async startEmailLogin(params: {
    email: string;
  }): Promise<EmailLoginStartResponse> {
    this.assertEmailSecrets();

    const email = normalizeEmail(params.email);
    const code = generateNumericCode(6);
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);

    await this.deps.repository.createEmailLoginCode({
      emailHash: hashEmail(email, this.deps.emailHashPepper),
      codeHash: hashEmailCode(email, code, this.deps.authEmailCodeSecret),
      expiresAt,
    });

    // Отправляем код на почту (не фатально: в dev код также виден на экране).
    await sendLoginCodeEmail(email, code);

    return {
      ok: true,
      expiresAt: expiresAt.toISOString(),
      ...(this.deps.exposeDevCode ? { devCode: code } : {}),
    };
  }

  async verifyEmailLogin(params: {
    email: string;
    code: string;
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
    const user = await this.deps.repository.upsertEmailUser(email);
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
    const deleted = await this.deps.repository.anonymizeUserAccount(
      userId,
      new Date()
    );
    if (!deleted) {
      throw apiError('E_NOT_FOUND', 'Аккаунт не найден');
    }
    return { ok: true };
  }

  private async finishLogin(
    user: AuthUserRecord,
    anonymousSessionId: string
  ): Promise<AuthLoginResult> {
    await this.deps.repository.migrateAnonymousSessionsToUser(
      anonymousSessionId,
      user.id
    );

    const promoted = await this.ensureAdminRole(user);

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

  private assertEmailSecrets() {
    if (!this.deps.authEmailCodeSecret) {
      throw apiError('E_UPSTREAM', 'AUTH_EMAIL_CODE_SECRET не задан');
    }
    if (!this.deps.emailHashPepper) {
      throw apiError('E_UPSTREAM', 'EMAIL_HASH_PEPPER не задан');
    }
  }
}

export function toAuthUserDto(user: AuthUserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername,
    displayName: user.displayName,
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

export function pickLoginResponse(result: AuthLoginResult): AuthLoginResponse {
  return { ok: true, user: result.user };
}

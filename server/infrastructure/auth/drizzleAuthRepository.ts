import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { UserRole } from '@/shared/dto';
import { getDb, schema } from '@/server/infrastructure/db/client';
import { apiError } from '@/server/utils/errors';
import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
  CreateAuthSessionInput,
  CreateEmailLoginCodeInput,
  CreateMagicLoginTokenInput,
  EmailLoginCodeRecord,
  MagicLoginTokenRecord,
  UpsertTelegramUserInput,
} from '@/server/interface/authRepository';

type UserRow = typeof schema.users.$inferSelect;
type AuthSessionRow = typeof schema.authSessions.$inferSelect;
type EmailLoginCodeRow = typeof schema.emailLoginCodes.$inferSelect;
type MagicLoginTokenRow = typeof schema.magicLoginTokens.$inferSelect;

function mapUser(row: UserRow): AuthUserRecord {
  return {
    id: row.id,
    email: row.email,
    telegramId: row.telegramId,
    telegramUsername: row.telegramUsername,
    displayName: row.displayName,
    role: row.role as UserRole,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAuthSession(row: AuthSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    csrfTokenHash: row.csrfTokenHash,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
  };
}

function mapEmailCode(row: EmailLoginCodeRow): EmailLoginCodeRecord {
  return {
    id: row.id,
    emailHash: row.emailHash,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    attempts: row.attempts,
    createdAt: row.createdAt,
  };
}

function mapMagicToken(row: MagicLoginTokenRow): MagicLoginTokenRecord {
  return {
    id: row.id,
    telegramId: row.telegramId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  };
}

function requireRow<T>(row: T | undefined, entity: string): T {
  if (!row) {
    throw apiError('E_UNKNOWN', `База данных не вернула ${entity}`);
  }
  return row;
}

export class DrizzleAuthRepository implements AuthRepository {
  private readonly db = getDb();

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return row ? mapUser(row) : null;
  }

  async findUserByTelegramId(
    telegramId: string
  ): Promise<AuthUserRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.telegramId, telegramId))
      .limit(1);
    return row ? mapUser(row) : null;
  }

  async upsertEmailUser(email: string): Promise<AuthUserRecord> {
    const now = new Date();
    const [existing] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.users)
        .set({
          emailVerifiedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.users.id, existing.id))
        .returning();
      return mapUser(requireRow(updated, 'user'));
    }

    const [created] = await this.db
      .insert(schema.users)
      .values({
        email,
        displayName: email,
        role: 'user',
        emailVerifiedAt: now,
        updatedAt: now,
      })
      .returning();
    return mapUser(requireRow(created, 'user'));
  }

  async setUserRole(userId: string, role: UserRole): Promise<AuthUserRecord> {
    const [updated] = await this.db
      .update(schema.users)
      .set({ role, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return mapUser(requireRow(updated, 'user'));
  }

  async upsertTelegramUser(
    input: UpsertTelegramUserInput
  ): Promise<AuthUserRecord> {
    const now = new Date();
    const [existing] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.telegramId, input.telegramId))
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.users)
        .set({
          telegramUsername: input.telegramUsername ?? existing.telegramUsername,
          displayName: input.displayName ?? existing.displayName,
          updatedAt: now,
        })
        .where(eq(schema.users.id, existing.id))
        .returning();
      return mapUser(requireRow(updated, 'user'));
    }

    const [created] = await this.db
      .insert(schema.users)
      .values({
        telegramId: input.telegramId,
        telegramUsername: input.telegramUsername ?? null,
        displayName: input.displayName ?? input.telegramUsername ?? null,
        role: 'user',
        updatedAt: now,
      })
      .returning();
    return mapUser(requireRow(created, 'user'));
  }

  async createEmailLoginCode(
    input: CreateEmailLoginCodeInput
  ): Promise<EmailLoginCodeRecord> {
    const [row] = await this.db
      .insert(schema.emailLoginCodes)
      .values(input)
      .returning();
    return mapEmailCode(requireRow(row, 'email_login_code'));
  }

  async findActiveEmailLoginCode(
    emailHash: string,
    now: Date
  ): Promise<EmailLoginCodeRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.emailLoginCodes)
      .where(
        and(
          eq(schema.emailLoginCodes.emailHash, emailHash),
          isNull(schema.emailLoginCodes.consumedAt),
          gt(schema.emailLoginCodes.expiresAt, now)
        )
      )
      .orderBy(desc(schema.emailLoginCodes.createdAt))
      .limit(1);
    return row ? mapEmailCode(row) : null;
  }

  async incrementEmailLoginCodeAttempts(id: string): Promise<void> {
    const current = await this.db
      .select({ attempts: schema.emailLoginCodes.attempts })
      .from(schema.emailLoginCodes)
      .where(eq(schema.emailLoginCodes.id, id))
      .limit(1);
    const attempts = current[0]?.attempts ?? 0;
    await this.db
      .update(schema.emailLoginCodes)
      .set({ attempts: attempts + 1 })
      .where(eq(schema.emailLoginCodes.id, id));
  }

  async consumeEmailLoginCode(id: string): Promise<void> {
    await this.db
      .update(schema.emailLoginCodes)
      .set({ consumedAt: new Date() })
      .where(eq(schema.emailLoginCodes.id, id));
  }

  async migrateAnonymousSessionsToUser(
    anonymousSessionId: string,
    userId: string
  ): Promise<number> {
    const rows = await this.db
      .update(schema.interviewSessions)
      .set({ userId })
      .where(
        and(
          eq(schema.interviewSessions.anonymousSessionId, anonymousSessionId),
          isNull(schema.interviewSessions.userId)
        )
      )
      .returning({ id: schema.interviewSessions.id });
    return rows.length;
  }

  async createAuthSession(
    input: CreateAuthSessionInput
  ): Promise<AuthSessionRecord> {
    const [row] = await this.db
      .insert(schema.authSessions)
      .values(input)
      .returning();
    return mapAuthSession(requireRow(row, 'auth_session'));
  }

  async findAuthSessionById(id: string): Promise<AuthSessionRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.id, id))
      .limit(1);
    return row ? mapAuthSession(row) : null;
  }

  async touchAuthSession(id: string): Promise<void> {
    await this.db
      .update(schema.authSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.authSessions.id, id));
  }

  async revokeAuthSession(id: string): Promise<void> {
    await this.db
      .update(schema.authSessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.authSessions.id, id));
  }

  async createMagicLoginToken(
    input: CreateMagicLoginTokenInput
  ): Promise<MagicLoginTokenRecord> {
    const [row] = await this.db
      .insert(schema.magicLoginTokens)
      .values(input)
      .returning();
    return mapMagicToken(requireRow(row, 'magic_login_token'));
  }

  async consumeMagicLoginToken(
    tokenHash: string,
    now: Date
  ): Promise<MagicLoginTokenRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.magicLoginTokens)
      .where(
        and(
          eq(schema.magicLoginTokens.tokenHash, tokenHash),
          isNull(schema.magicLoginTokens.consumedAt),
          gt(schema.magicLoginTokens.expiresAt, now)
        )
      )
      .limit(1);
    if (!row) return null;

    const [consumed] = await this.db
      .update(schema.magicLoginTokens)
      .set({ consumedAt: now })
      .where(eq(schema.magicLoginTokens.id, row.id))
      .returning();
    return consumed ? mapMagicToken(consumed) : null;
  }
}

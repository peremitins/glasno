import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
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
  UpsertEmailUserInput,
  UpsertTelegramUserInput,
  UpsertUserResult,
} from '@/server/interface/authRepository';
import { planAnonymousPreferenceMigration } from '@/server/application/questionPreferences/ownership';

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
    avatarVersion: row.avatarVersion,
    role: row.role as UserRole,
    onboarding: normalizeOnboardingRecord(row.onboarding),
    emailVerifiedAt: row.emailVerifiedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeOnboardingRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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

// Telegram может обновлять username, но не имя: имя пользователь редактирует
// сам в профиле, и повторный Telegram-вход не должен его восстановить.
export function buildExistingTelegramUserUpdate(
  input: UpsertTelegramUserInput,
  existing: Pick<AuthUserRecord, 'telegramUsername'>,
  now: Date
) {
  return {
    telegramUsername: input.telegramUsername ?? existing.telegramUsername,
    updatedAt: now,
  };
}

export class DrizzleAuthRepository implements AuthRepository {
  constructor(private readonly db = getDb()) {}

  async withUserAvatarLock<T>(
    userId: string,
    callback: (repository: AuthRepository) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      // Не фильтруем deleted_at: удалённую строку тоже нужно заблокировать,
      // чтобы параллельная загрузка не могла снова записать объект в S3.
      await tx.execute(
        sql`select ${schema.users.id} from ${schema.users} where ${schema.users.id} = ${userId} for update`
      );
      return callback(
        new DrizzleAuthRepository(tx as unknown as ReturnType<typeof getDb>)
      );
    });
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)))
      .limit(1);
    return row ? mapUser(row) : null;
  }

  async findUserByTelegramId(
    telegramId: string
  ): Promise<AuthUserRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.telegramId, telegramId),
          isNull(schema.users.deletedAt)
        )
      )
      .limit(1);
    return row ? mapUser(row) : null;
  }

  async upsertEmailUser(input: UpsertEmailUserInput): Promise<UpsertUserResult> {
    const { email, displayName } = input;
    const now = new Date();
    const [existing] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
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
      return { user: mapUser(requireRow(updated, 'user')), isNew: false };
    }

    const [created] = await this.db
      .insert(schema.users)
      .values({
        email,
        displayName: displayName ?? null,
        role: 'user',
        emailVerifiedAt: now,
        updatedAt: now,
      })
      .returning();
    return { user: mapUser(requireRow(created, 'user')), isNew: true };
  }

  async setUserRole(userId: string, role: UserRole): Promise<AuthUserRecord> {
    const [updated] = await this.db
      .update(schema.users)
      .set({ role, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return mapUser(requireRow(updated, 'user'));
  }

  async updateDisplayName(
    userId: string,
    displayName: string | null
  ): Promise<AuthUserRecord | null> {
    const [updated] = await this.db
      .update(schema.users)
      .set({ displayName, updatedAt: new Date() })
      .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
      .returning();
    return updated ? mapUser(updated) : null;
  }

  async setAvatarVersion(
    userId: string,
    avatarVersion: string | null
  ): Promise<AuthUserRecord | null> {
    const [updated] = await this.db
      .update(schema.users)
      .set({ avatarVersion, updatedAt: new Date() })
      .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
      .returning();
    return updated ? mapUser(updated) : null;
  }

  async upsertTelegramUser(
    input: UpsertTelegramUserInput
  ): Promise<UpsertUserResult> {
    const now = new Date();
    const [existing] = await this.db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.telegramId, input.telegramId),
          isNull(schema.users.deletedAt)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.users)
        .set(buildExistingTelegramUserUpdate(input, existing, now))
        .where(eq(schema.users.id, existing.id))
        .returning();
      return { user: mapUser(requireRow(updated, 'user')), isNew: false };
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
    return { user: mapUser(requireRow(created, 'user')), isNew: true };
  }

  async anonymizeUserAccount(userId: string, now: Date): Promise<boolean> {
    const [updated] = await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.interviewQuestionPreferences)
        .where(eq(schema.interviewQuestionPreferences.userId, userId));
      const ownedSessions = await tx
        .select({ id: schema.interviewSessions.id })
        .from(schema.interviewSessions)
        .where(eq(schema.interviewSessions.userId, userId));
      const sessionIds = ownedSessions.map((session) => session.id);

      if (sessionIds.length > 0) {
        await tx
          .delete(schema.realtimeVoiceSessions)
          .where(
            or(
              eq(schema.realtimeVoiceSessions.userId, userId),
              inArray(schema.realtimeVoiceSessions.interviewSessionId, sessionIds)
            )
          );
        await tx
          .delete(schema.aiUsage)
          .where(
            or(
              eq(schema.aiUsage.userId, userId),
              inArray(schema.aiUsage.interviewSessionId, sessionIds)
            )
          );
        await tx
          .delete(schema.interviewReports)
          .where(inArray(schema.interviewReports.sessionId, sessionIds));
        await tx
          .delete(schema.interviewTurns)
          .where(inArray(schema.interviewTurns.sessionId, sessionIds));
        await tx
          .delete(schema.interviewSessions)
          .where(inArray(schema.interviewSessions.id, sessionIds));
      } else {
        await tx
          .delete(schema.realtimeVoiceSessions)
          .where(eq(schema.realtimeVoiceSessions.userId, userId));
        await tx.delete(schema.aiUsage).where(eq(schema.aiUsage.userId, userId));
      }

      await tx
        .update(schema.paymentOrders)
        .set({ metadata: null, updatedAt: now })
        .where(eq(schema.paymentOrders.userId, userId));
      await tx
        .update(schema.authSessions)
        .set({ revokedAt: now })
        .where(eq(schema.authSessions.userId, userId));

      return tx
        .update(schema.users)
        .set({
          email: null,
          telegramId: null,
          telegramUsername: null,
          displayName: null,
          avatarVersion: null,
          role: 'user',
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
        .returning({ id: schema.users.id });
    });

    return Boolean(updated);
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
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(schema.interviewSessions)
        .set({ userId })
        .where(
          and(
            eq(schema.interviewSessions.anonymousSessionId, anonymousSessionId),
            isNull(schema.interviewSessions.userId)
          )
        )
        .returning({ id: schema.interviewSessions.id });

      const anonymousPreferences = await tx
        .select()
        .from(schema.interviewQuestionPreferences)
        .where(
          and(
            eq(
              schema.interviewQuestionPreferences.anonymousSessionId,
              anonymousSessionId
            ),
            isNull(schema.interviewQuestionPreferences.userId)
          )
        );
      const userPreferences = await tx
        .select()
        .from(schema.interviewQuestionPreferences)
        .where(eq(schema.interviewQuestionPreferences.userId, userId));
      const migration = planAnonymousPreferenceMigration(
        anonymousPreferences,
        userPreferences
      );

      for (const replacement of migration.replace) {
        const source = anonymousPreferences.find(
          (item) => item.id === replacement.sourceId
        );
        if (!source) continue;
        await tx
          .update(schema.interviewQuestionPreferences)
          .set({
            status: source.status,
            question: source.question,
            semantic: source.semantic,
            roleLabel: source.roleLabel,
            contextTags: source.contextTags,
            focus: source.focus,
            sourceSessionId: source.sourceSessionId,
            sourceTurnId: source.sourceTurnId,
            lastPracticedAt: source.lastPracticedAt,
            practiceCount: source.practiceCount,
            updatedAt: source.updatedAt,
          })
          .where(
            eq(
              schema.interviewQuestionPreferences.id,
              replacement.targetId
            )
          );
        await tx
          .delete(schema.interviewQuestionPreferences)
          .where(
            eq(
              schema.interviewQuestionPreferences.id,
              replacement.sourceId
            )
          );
      }
      if (migration.deleteIds.length) {
        await tx
          .delete(schema.interviewQuestionPreferences)
          .where(
            inArray(
              schema.interviewQuestionPreferences.id,
              migration.deleteIds
            )
          );
      }
      if (migration.attachIds.length) {
        await tx
          .update(schema.interviewQuestionPreferences)
          .set({ userId, updatedAt: new Date() })
          .where(
            inArray(
              schema.interviewQuestionPreferences.id,
              migration.attachIds
            )
          );
      }
      return rows.length;
    });
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

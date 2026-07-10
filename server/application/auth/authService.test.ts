import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './authService';
import { hashEmail, hashEmailCode, normalizeEmail } from './authCrypto';
import { AuthSessionService } from './authSessionService';

function createRepository() {
  const users: any[] = [];
  const codes: any[] = [];
  const sessions: any[] = [];
  const migrated: Array<{ anonymousSessionId: string; userId: string }> = [];

  return {
    users,
    codes,
    sessions,
    migrated,
    async createEmailLoginCode(input: any) {
      const code = {
        id: `code_${codes.length + 1}`,
        consumedAt: null,
        attempts: 0,
        createdAt: new Date('2026-06-28T10:00:00.000Z'),
        ...input,
      };
      codes.push(code);
      return code;
    },
    async findActiveEmailLoginCode(emailHash: string, now: Date) {
      return (
        codes.find(
          (code) =>
            code.emailHash === emailHash &&
            !code.consumedAt &&
            code.expiresAt.getTime() > now.getTime()
        ) ?? null
      );
    },
    async incrementEmailLoginCodeAttempts(id: string) {
      const code = codes.find((item) => item.id === id);
      if (code) code.attempts += 1;
    },
    async consumeEmailLoginCode(id: string) {
      const code = codes.find((item) => item.id === id);
      if (code) code.consumedAt = new Date('2026-06-28T10:01:00.000Z');
    },
    async upsertEmailUser(email: string) {
      const existing = users.find((user) => user.email === email);
      if (existing) return existing;
      const user = {
        id: `user_${users.length + 1}`,
        email,
        telegramId: null,
        telegramUsername: null,
        displayName: email,
        role: 'user',
        onboarding: {},
        emailVerifiedAt: new Date('2026-06-28T10:01:00.000Z'),
        createdAt: new Date('2026-06-28T10:01:00.000Z'),
        updatedAt: new Date('2026-06-28T10:01:00.000Z'),
        deletedAt: null,
      };
      users.push(user);
      return user;
    },
    async migrateAnonymousSessionsToUser(anonymousSessionId: string, userId: string) {
      migrated.push({ anonymousSessionId, userId });
      return 2;
    },
    async createAuthSession(input: any) {
      const session = {
        id: `auth_${sessions.length + 1}`,
        createdAt: new Date('2026-06-28T10:01:00.000Z'),
        lastSeenAt: null,
        revokedAt: null,
        ...input,
      };
      sessions.push(session);
      return session;
    },
    async findAuthSessionById(id: string) {
      return sessions.find((session) => session.id === id) ?? null;
    },
    async touchAuthSession() {},
    async findUserById(id: string) {
      return users.find((user) => user.id === id && !user.deletedAt) ?? null;
    },
    async anonymizeUserAccount(userId: string, now: Date) {
      const user = users.find((item) => item.id === userId);
      if (!user || user.deletedAt) return false;
      user.email = null;
      user.telegramId = null;
      user.telegramUsername = null;
      user.displayName = null;
      user.role = 'user';
      user.deletedAt = now;
      user.updatedAt = now;
      sessions
        .filter((session) => session.userId === userId)
        .forEach((session) => {
          session.revokedAt = now;
        });
      return true;
    },
  };
}

describe('AuthService', () => {
  it('verifies email code, creates user session, and migrates anonymous data', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T10:00:00.000Z'));

    const repository = createRepository();
    const sessionService = new AuthSessionService({
      repository: repository as any,
      sessionSecret: 'session-secret',
    });
    const service = new AuthService({
      repository: repository as any,
      sessionService,
      authEmailCodeSecret: 'code-secret',
      emailHashPepper: 'email-pepper',
      telegramBotToken: '',
      exposeDevCode: true,
    });

    const started = await service.startEmailLogin({
      email: 'User@Example.COM',
    });
    const normalized = normalizeEmail('User@Example.COM');

    expect(started.devCode).toMatch(/^\d{6}$/);
    expect(repository.codes[0]).toMatchObject({
      emailHash: hashEmail(normalized, 'email-pepper'),
      codeHash: hashEmailCode(normalized, started.devCode!, 'code-secret'),
    });

    const verified = await service.verifyEmailLogin({
      email: ' user@example.com ',
      code: started.devCode!,
      anonymousSessionId: 'anon_1',
    });

    expect(verified.user).toMatchObject({
      id: 'user_1',
      email: 'user@example.com',
      role: 'user',
    });
    expect(verified.cookieValue).toBeTruthy();
    expect(verified.csrfToken).toBeTruthy();
    expect(repository.migrated).toEqual([
      { anonymousSessionId: 'anon_1', userId: 'user_1' },
    ]);
    expect(repository.codes[0].consumedAt).toBeInstanceOf(Date);

    vi.useRealTimers();
  });

  it('anonymizes account data and makes the user unavailable for future sessions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T11:00:00.000Z'));

    const repository = createRepository();
    const sessionService = new AuthSessionService({
      repository: repository as any,
      sessionSecret: 'session-secret',
    });
    const service = new AuthService({
      repository: repository as any,
      sessionService,
      authEmailCodeSecret: 'code-secret',
      emailHashPepper: 'email-pepper',
      telegramBotToken: '',
      exposeDevCode: true,
    });

    const started = await service.startEmailLogin({ email: 'delete@example.com' });
    const verified = await service.verifyEmailLogin({
      email: 'delete@example.com',
      code: started.devCode!,
      anonymousSessionId: 'anon_delete',
    });

    await expect(service.deleteAccount(verified.user.id)).resolves.toEqual({
      ok: true,
    });
    await expect(repository.findUserById(verified.user.id)).resolves.toBeNull();
    expect(repository.users[0]).toMatchObject({
      email: null,
      telegramId: null,
      telegramUsername: null,
      displayName: null,
      role: 'user',
      deletedAt: new Date('2026-06-28T11:00:00.000Z'),
    });
    expect(repository.sessions[0].revokedAt).toEqual(
      new Date('2026-06-28T11:00:00.000Z')
    );

    vi.useRealTimers();
  });
});

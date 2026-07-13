import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './authService';
import { hashEmail, hashEmailCode, normalizeEmail } from './authCrypto';
import { AuthSessionService } from './authSessionService';
import { sendLoginCodeEmail } from './emailSender';

vi.mock('./emailSender', () => ({
  sendLoginCodeEmail: vi.fn().mockResolvedValue(true),
}));

function createRepository() {
  const users: any[] = [];
  const codes: any[] = [];
  const sessions: any[] = [];
  const migrated: Array<{ anonymousSessionId: string; userId: string }> = [];
  const accountDeletionOrder: string[] = [];

  return {
    users,
    codes,
    sessions,
    migrated,
    accountDeletionOrder,
    async withUserAvatarLock<T>(
      _userId: string,
      callback: (repository: never) => Promise<T>
    ): Promise<T> {
      return callback(this as never);
    },
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
    async upsertEmailUser(input: { email: string; displayName?: string | null }) {
      const { email, displayName } = input;
      const existing = users.find((user) => user.email === email);
      if (existing) {
        existing.emailVerifiedAt = new Date('2026-06-28T10:01:00.000Z');
        return existing;
      }
      const user = {
        id: `user_${users.length + 1}`,
        email,
        telegramId: null,
        telegramUsername: null,
        displayName: displayName ?? null,
        avatarVersion: null,
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
    async upsertTelegramUser(input: any) {
      const existing = users.find(
        (user) => user.telegramId === input.telegramId
      );
      if (existing) {
        existing.telegramUsername =
          input.telegramUsername ?? existing.telegramUsername;
        return existing;
      }
      const user = {
        id: `user_${users.length + 1}`,
        email: null,
        telegramId: input.telegramId,
        telegramUsername: input.telegramUsername ?? null,
        displayName: input.displayName ?? input.telegramUsername ?? null,
        avatarVersion: null,
        role: 'user',
        onboarding: {},
        emailVerifiedAt: null,
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
      accountDeletionOrder.push('anonymizeUserAccount');
      user.email = null;
      user.telegramId = null;
      user.telegramUsername = null;
      user.displayName = null;
      user.avatarVersion = null;
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
  it('verifies email code and transfers anonymous interview data to the user', async () => {
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

  it('uses configured test login code for allowlisted email without sending mail', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T10:00:00.000Z'));
    vi.mocked(sendLoginCodeEmail).mockClear();

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
      testLoginEmails: ['externalreview@glasno.test'],
      testLoginCode: '123456',
    });

    const started = await service.startEmailLogin({
      email: ' ExternalReview@Glasno.Test ',
    });

    expect(started).toMatchObject({ ok: true });
    expect(started.devCode).toBeUndefined();
    expect(sendLoginCodeEmail).not.toHaveBeenCalled();
    expect(repository.codes[0]).toMatchObject({
      emailHash: hashEmail('externalreview@glasno.test', 'email-pepper'),
      codeHash: hashEmailCode(
        'externalreview@glasno.test',
        '123456',
        'code-secret'
      ),
    });

    const verified = await service.verifyEmailLogin({
      email: 'externalreview@glasno.test',
      code: '123456',
      anonymousSessionId: 'anon_review',
    });

    expect(verified.user).toMatchObject({
      email: 'externalreview@glasno.test',
      role: 'user',
    });
    expect(repository.migrated).toEqual([
      { anonymousSessionId: 'anon_review', userId: verified.user.id },
    ]);

    vi.useRealTimers();
  });

  it('сохраняет имя только при первом email-входе и не перезаписывает его', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T10:00:00.000Z'));

    const repository = createRepository();
    const service = new AuthService({
      repository: repository as any,
      sessionService: new AuthSessionService({
        repository: repository as any,
        sessionSecret: 'session-secret',
      }),
      authEmailCodeSecret: 'code-secret',
      emailHashPepper: 'email-pepper',
      telegramBotToken: '',
      exposeDevCode: true,
    });

    const first = await service.startEmailLogin({ email: 'name@example.com' });
    const created = await service.verifyEmailLogin({
      email: 'name@example.com',
      code: first.devCode!,
      displayName: '  Анна  ',
      anonymousSessionId: 'anon_name_first',
    });
    const second = await service.startEmailLogin({ email: 'name@example.com' });
    const loggedInAgain = await service.verifyEmailLogin({
      email: 'name@example.com',
      code: second.devCode!,
      displayName: 'Другое имя',
      anonymousSessionId: 'anon_name_second',
    });

    expect(created.user.displayName).toBe('Анна');
    expect(loggedInAgain.user.displayName).toBe('Анна');

    vi.useRealTimers();
  });

  it('не сохраняет пустое имя при создании email-профиля', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T10:00:00.000Z'));

    const repository = createRepository();
    const service = new AuthService({
      repository: repository as any,
      sessionService: new AuthSessionService({
        repository: repository as any,
        sessionSecret: 'session-secret',
      }),
      authEmailCodeSecret: 'code-secret',
      emailHashPepper: 'email-pepper',
      telegramBotToken: '',
      exposeDevCode: true,
    });

    const started = await service.startEmailLogin({ email: 'blank@example.com' });
    const verified = await service.verifyEmailLogin({
      email: 'blank@example.com',
      code: started.devCode!,
      displayName: '   ',
      anonymousSessionId: 'anon_blank',
    });

    expect(verified.user.displayName).toBeNull();
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
      createAvatarStorage: () => ({
        putAvatar: async () => {},
        getAvatar: async () => null,
        deleteAvatar: async (userId: string) => {
          repository.accountDeletionOrder.push(`deleteAvatar:${userId}`);
        },
      }),
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
    expect(repository.accountDeletionOrder).toEqual([
      `deleteAvatar:${verified.user.id}`,
      'anonymizeUserAccount',
    ]);
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

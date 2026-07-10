import { describe, expect, it, vi } from 'vitest';
import { AuthSessionService } from './authSessionService';

function createRepository() {
  const sessions: any[] = [];
  const users = [
    {
      id: 'user_1',
      email: 'user@example.com',
      telegramId: null,
      telegramUsername: null,
      displayName: 'User',
      role: 'user',
      onboarding: {},
      emailVerifiedAt: new Date('2026-06-28T10:00:00.000Z'),
      createdAt: new Date('2026-06-28T10:00:00.000Z'),
      updatedAt: new Date('2026-06-28T10:00:00.000Z'),
    },
  ];

  return {
    sessions,
    async createAuthSession(input: any) {
      const session = {
        id: `auth_${sessions.length + 1}`,
        createdAt: new Date('2026-06-28T10:00:00.000Z'),
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
    async touchAuthSession(id: string) {
      const session = sessions.find((item) => item.id === id);
      if (session) session.lastSeenAt = new Date('2026-06-28T10:05:00.000Z');
    },
    async findUserById(id: string) {
      return users.find((user) => user.id === id) ?? null;
    },
  };
}

describe('AuthSessionService', () => {
  it('creates signed http cookie value and rejects tampered token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T10:00:00.000Z'));
    const repository = createRepository();
    const service = new AuthSessionService({
      repository: repository as any,
      sessionSecret: 'session-secret',
    });

    const created = await service.createForUser('user_1');
    const resolved = await service.resolveFromCookie(created.cookieValue);

    expect(resolved?.user.id).toBe('user_1');
    expect(resolved?.session.id).toBe('auth_1');
    expect(await service.resolveFromCookie(`${created.cookieValue}x`)).toBeNull();

    vi.useRealTimers();
  });

  it('validates CSRF double submit against stored session hash', async () => {
    const repository = createRepository();
    const service = new AuthSessionService({
      repository: repository as any,
      sessionSecret: 'session-secret',
    });

    const created = await service.createForUser('user_1');

    expect(
      service.validateCsrf({
        session: created.session,
        cookieToken: created.csrfToken,
        headerToken: created.csrfToken,
      })
    ).toBe(true);
    expect(
      service.validateCsrf({
        session: created.session,
        cookieToken: created.csrfToken,
        headerToken: 'different-token',
      })
    ).toBe(false);
  });
});

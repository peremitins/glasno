import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  buildExistingTelegramUserUpdate,
  DrizzleAuthRepository,
} from './drizzleAuthRepository';

function createExistingUser(displayName: string | null) {
  return {
    id: 'user_1',
    email: null,
    telegramId: '42',
    telegramUsername: 'old_username',
    displayName,
    avatarVersion: null,
    role: 'user',
    onboarding: {},
    emailVerifiedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-07-13T10:00:00.000Z'),
    updatedAt: new Date('2026-07-13T10:00:00.000Z'),
  };
}

function createExistingTelegramRepositoryDb(existing: ReturnType<typeof createExistingUser>) {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [existing],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return {
          where: () => ({
            returning: async () => [{ ...existing, ...values }],
          }),
        };
      },
    }),
  };
  return { db, updates };
}

describe('buildExistingTelegramUserUpdate', () => {
  it('не возвращает displayName при повторном Telegram-входе', () => {
    const update = buildExistingTelegramUserUpdate(
      {
        telegramId: '42',
        telegramUsername: 'new_username',
        displayName: 'Имя из Telegram',
      },
      { telegramUsername: 'old_username' },
      new Date('2026-07-13T12:00:00.000Z')
    );

    expect(update).toEqual({
      telegramUsername: 'new_username',
      updatedAt: new Date('2026-07-13T12:00:00.000Z'),
    });
    expect(update).not.toHaveProperty('displayName');
  });

  it.each([null, 'Ручное имя'])(
    'сохраняет %s при повторном Telegram-входе',
    async (displayName) => {
      const existing = createExistingUser(displayName);
      const { db, updates } = createExistingTelegramRepositoryDb(existing);
      const repository = new DrizzleAuthRepository(db as never);

      const user = await repository.upsertTelegramUser({
        telegramId: '42',
        telegramUsername: 'new_username',
        displayName: 'Имя из Telegram',
      });

      expect(updates[0]).not.toHaveProperty('displayName');
      expect(user.displayName).toBe(displayName);
    }
  );

  it('блокирует строку пользователя FOR UPDATE до callback, включая deleted row', async () => {
    const events: string[] = [];
    const queries: unknown[] = [];
    const transactionDb = {
      execute: async (query: unknown) => {
        events.push('lock');
        queries.push(query);
        return { rows: [] };
      },
    };
    const db = {
      transaction: async <T>(
        callback: (tx: typeof transactionDb) => Promise<T>
      ) => {
        events.push('transaction');
        return callback(transactionDb);
      },
    };
    const repository = new DrizzleAuthRepository(db as never);

    await repository.withUserAvatarLock('user_1', async () => {
      events.push('callback');
    });

    const query = new PgDialect().sqlToQuery(queries[0] as never);
    expect(events).toEqual(['transaction', 'lock', 'callback']);
    expect(query.sql).toMatch(/for update$/i);
    expect(query.sql).not.toContain('deleted_at');
  });
});

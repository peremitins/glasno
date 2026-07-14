import { readFileSync } from 'node:fs';
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

function createNewUserRepositoryDb() {
  const inserted: Array<Record<string, unknown>> = [];
  const defaults = {
    id: 'new_user_1',
    email: null,
    telegramId: null,
    telegramUsername: null,
    displayName: null,
    avatarVersion: null,
    role: 'user',
    onboarding: {},
    emailVerifiedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-07-13T12:00:00.000Z'),
    updatedAt: new Date('2026-07-13T12:00:00.000Z'),
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return {
          returning: async () => [{ ...defaults, ...values }],
        };
      },
    }),
  };
  return { db, inserted };
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
    'сохраняет %s при повторном Telegram-входе и возвращает isNew: false',
    async (displayName) => {
      const existing = createExistingUser(displayName);
      const { db, updates } = createExistingTelegramRepositoryDb(existing);
      const repository = new DrizzleAuthRepository(db as never);

      const { user, isNew } = await repository.upsertTelegramUser({
        telegramId: '42',
        telegramUsername: 'new_username',
        displayName: 'Имя из Telegram',
      });

      expect(updates[0]).not.toHaveProperty('displayName');
      expect(user.displayName).toBe(displayName);
      expect(isNew).toBe(false);
    }
  );

  it('возвращает isNew: true при первом Telegram-входе (строки ещё нет)', async () => {
    const { db, inserted } = createNewUserRepositoryDb();
    const repository = new DrizzleAuthRepository(db as never);

    const { user, isNew } = await repository.upsertTelegramUser({
      telegramId: '777',
      telegramUsername: 'new_person',
      displayName: 'Новый Юзер',
    });

    expect(isNew).toBe(true);
    expect(inserted[0]).toMatchObject({ telegramId: '777' });
    expect(user.telegramId).toBe('777');
  });
});

describe('upsertEmailUser', () => {
  it('возвращает isNew: false и не создаёт новую строку при повторном email-входе', async () => {
    const existing = {
      id: 'user_1',
      email: 'ivan@example.com',
      telegramId: null,
      telegramUsername: null,
      displayName: null,
      avatarVersion: null,
      role: 'user',
      onboarding: {},
      emailVerifiedAt: null,
      deletedAt: null,
      createdAt: new Date('2026-07-13T10:00:00.000Z'),
      updatedAt: new Date('2026-07-13T10:00:00.000Z'),
    };
    const { db } = createExistingTelegramRepositoryDb(existing as never);
    const repository = new DrizzleAuthRepository(db as never);

    const { user, isNew } = await repository.upsertEmailUser({
      email: 'ivan@example.com',
      displayName: 'Иван',
    });

    expect(isNew).toBe(false);
    expect(user.email).toBe('ivan@example.com');
  });

  it('возвращает isNew: true при первом email-входе (строки ещё нет)', async () => {
    const { db, inserted } = createNewUserRepositoryDb();
    const repository = new DrizzleAuthRepository(db as never);

    const { user, isNew } = await repository.upsertEmailUser({
      email: 'new@example.com',
      displayName: 'Новый Юзер',
    });

    expect(isNew).toBe(true);
    expect(inserted[0]).toMatchObject({ email: 'new@example.com' });
    expect(user.email).toBe('new@example.com');
  });
});

describe('withUserAvatarLock', () => {
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

describe('anonymizeUserAccount', () => {
  it('отвязывает минутные списания до удаления голосовых сессий', () => {
    const source = readFileSync('server/infrastructure/auth/drizzleAuthRepository.ts', 'utf8');
    const debitUnlinkIndex = source.indexOf(
      '.update(schema.realtimeMinuteDebits)'
    );
    const realtimeSessionDeleteIndex = source.indexOf(
      '.delete(schema.realtimeVoiceSessions)'
    );

    expect(debitUnlinkIndex).toBeGreaterThan(-1);
    expect(debitUnlinkIndex).toBeLessThan(realtimeSessionDeleteIndex);
    expect(source.slice(debitUnlinkIndex, realtimeSessionDeleteIndex)).toContain(
      'realtimeSessionId: null'
    );
  });
});

import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '@/server/infrastructure/db/client';
import { DrizzleInterviewRepository } from './drizzleInterviewRepository';

const database = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock('@/server/infrastructure/db/client', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/server/infrastructure/db/client')
  >();
  return { ...actual, getDb: database.getDb };
});

function tableName(table: unknown): string {
  const entries: Array<[string, unknown]> = [
    ['realtimeVoiceSessions', schema.realtimeVoiceSessions],
    ['realtimeMinuteDebits', schema.realtimeMinuteDebits],
    ['aiUsage', schema.aiUsage],
    ['interviewReports', schema.interviewReports],
    ['interviewTurns', schema.interviewTurns],
    ['interviewSessions', schema.interviewSessions],
  ];
  return entries.find(([, value]) => value === table)?.[0] ?? 'unknown';
}

describe('DrizzleInterviewRepository.deleteSession', () => {
  it('отвязывает минутные списания до удаления голосовых сессий', async () => {
    const events: string[] = [];
    const debitUpdates: Array<{ values: Record<string, unknown>; where: unknown }> =
      [];

    const tx = {
      select: () => ({
        from: (table: unknown) => ({
          where: async () => {
            events.push(`select:${tableName(table)}`);
            return [{ id: 'voice_1' }, { id: 'voice_2' }];
          },
        }),
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async (condition: unknown) => {
            events.push(`update:${tableName(table)}`);
            debitUpdates.push({ values, where: condition });
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: () => {
          events.push(`delete:${tableName(table)}`);
          const result = Promise.resolve(undefined) as Promise<unknown> & {
            returning: () => Promise<Array<{ id: string }>>;
          };
          result.returning = async () => [{ id: 'session_1' }];
          return result;
        },
      }),
    };

    database.getDb.mockReturnValue({
      transaction: async <T>(callback: (value: typeof tx) => Promise<T>) =>
        callback(tx),
    });

    const repository = new DrizzleInterviewRepository();
    const deleted = await repository.deleteSession('session_1');

    expect(deleted).toBe(true);
    expect(events.indexOf('update:realtimeMinuteDebits')).toBeGreaterThan(-1);
    expect(events.indexOf('update:realtimeMinuteDebits')).toBeLessThan(
      events.indexOf('delete:realtimeVoiceSessions')
    );
    expect(debitUpdates[0]?.values).toMatchObject({ realtimeSessionId: null });

    const query = new PgDialect().sqlToQuery(debitUpdates[0]?.where as never);
    expect(query.sql).toContain('realtime_session_id');
    expect(query.params).toEqual(expect.arrayContaining(['voice_1', 'voice_2']));
  });

  it('не трогает списания, если голосовых сессий у интервью не было', async () => {
    const events: string[] = [];

    const tx = {
      select: () => ({
        from: (table: unknown) => ({
          where: async () => {
            events.push(`select:${tableName(table)}`);
            return [];
          },
        }),
      }),
      update: (table: unknown) => ({
        set: () => ({
          where: async () => {
            events.push(`update:${tableName(table)}`);
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: () => {
          events.push(`delete:${tableName(table)}`);
          const result = Promise.resolve(undefined) as Promise<unknown> & {
            returning: () => Promise<Array<{ id: string }>>;
          };
          result.returning = async () => [{ id: 'session_1' }];
          return result;
        },
      }),
    };

    database.getDb.mockReturnValue({
      transaction: async <T>(callback: (value: typeof tx) => Promise<T>) =>
        callback(tx),
    });

    const repository = new DrizzleInterviewRepository();
    await repository.deleteSession('session_1');

    expect(events).not.toContain('update:realtimeMinuteDebits');
  });
});

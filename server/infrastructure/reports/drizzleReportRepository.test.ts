import { describe, expect, it, vi } from 'vitest';
import type { ReportAnalysis } from '@/shared/dto';
import { schema } from '@/server/infrastructure/db/client';
import { DrizzleReportRepository } from './drizzleReportRepository';

const database = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock('@/server/infrastructure/db/client', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/server/infrastructure/db/client')
  >();
  return { ...actual, getDb: database.getDb };
});

const report = {
  id: 'report_1',
  sessionId: 'session_1',
  status: 'processing',
  overallScore: null,
  verdict: null,
  summary: null,
  criteria: null,
  recommendations: null,
  questionAnalysis: null,
  errorMessage: null,
  model: null,
  createdAt: new Date('2026-07-14T10:00:00.000Z'),
  updatedAt: new Date('2026-07-14T10:00:00.000Z'),
};

const analysis: ReportAnalysis = {
  overallScore: 75,
  verdict: 'Готов к следующему этапу',
  summary: 'Уверенные ответы.',
  criteria: {
    substance: 75,
    structure: 75,
    delivery: 75,
  },
  recommendations: { topFixes: ['Добавить измеримый результат'] },
  questionAnalysis: [
    {
      turnId: 'turn_1',
      kind: 'main',
      question: 'Расскажите о проекте',
      answer: 'Запустил новый процесс',
      criteria: { substance: 75, structure: 75, delivery: 75 },
      whatWorked: 'Есть конкретный пример.',
      whatWeak: 'Не хватает метрики.',
      modelAnswer: 'Улучшил метрику на 20%.',
      strongerAnswerStar: 'Ситуация, задача, действие, результат.',
      nextPractice: 'Добавить цифры к ответу.',
    },
  ],
  model: 'gpt-5',
};

describe('DrizzleReportRepository', () => {
  it('фиксирует использованное бесплатное интервью только после готового отчёта', async () => {
    const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const tx = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [{ ...report, ...analysis, status: 'done' }],
          }),
        }),
      }),
      select: vi.fn().mockImplementation(() => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              tx.select.mock.calls.length === 1
                ? [{ userId: 'user_1' }]
                : [{ email: 'hello@mentala.app', telegramId: null }],
          }),
        }),
      })),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          inserts.push({ table, values });
          return { onConflictDoNothing: async () => undefined };
        },
      }),
    };
    database.getDb.mockReturnValue({
      transaction: async <T>(callback: (database: typeof tx) => Promise<T>) =>
        await callback(tx),
      ...tx,
    });
    const repository = new DrizzleReportRepository();

    await repository.saveCompleted(report.id, analysis);

    expect(inserts).toContainEqual({
      table: schema.trialInterviewHistory,
      values: {
        userId: 'user_1',
        email: 'hello@mentala.app',
        // Ключ попытки — канонический адрес: он не даёт получить новый
        // триал через плюс-адресацию.
        emailCanonical: 'hello@mentala.app',
        telegramId: null,
      },
    });
  });
});

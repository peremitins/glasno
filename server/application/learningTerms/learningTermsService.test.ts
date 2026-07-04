import { describe, expect, it, vi } from 'vitest';
import { LearningTermsService } from './learningTermsService';

function createRepository() {
  return {
    async findSessionById(id: string) {
      if (id === 'owned_session') {
        return {
          id,
          anonymousSessionId: 'anon_1',
          userId: null,
        };
      }
      if (id === 'user_session') {
        return {
          id,
          anonymousSessionId: 'anon_other',
          userId: 'user_1',
        };
      }
      return null;
    },
  };
}

function createReportRepository() {
  return {
    async findById(id: string) {
      if (id === 'report_1') return { id, sessionId: 'owned_session' };
      return null;
    },
  };
}

describe('LearningTermsService', () => {
  it('extracts terms for generic session-scoped text without ownership lookup', async () => {
    const engine = {
      extractTerms: vi.fn().mockResolvedValue({
        items: [{ id: 'item_1', terms: [] }],
      }),
      explainTerm: vi.fn(),
    };
    const service = new LearningTermsService({
      interviewRepository: createRepository(),
      reportRepository: createReportRepository(),
      engine,
    });

    await expect(
      service.extractTerms({
        anonymousSessionId: 'anon_1',
        input: {
          items: [
            {
              id: 'item_1',
              text: 'Обычный текст',
              context: { kind: 'dashboard' },
            },
          ],
        },
      })
    ).resolves.toEqual({ items: [{ id: 'item_1', terms: [] }] });
    expect(engine.extractTerms).toHaveBeenCalledOnce();
  });

  it('rejects extraction for an interview session owned by another visitor', async () => {
    const service = new LearningTermsService({
      interviewRepository: createRepository(),
      reportRepository: createReportRepository(),
      engine: {
        extractTerms: vi.fn(),
        explainTerm: vi.fn(),
      },
    });

    await expect(
      service.extractTerms({
        anonymousSessionId: 'anon_2',
        input: {
          items: [
            {
              id: 'item_1',
              text: 'Что такое CORS?',
              context: {
                kind: 'interview_question',
                interviewSessionId: 'owned_session',
              },
            },
          ],
        },
      })
    ).rejects.toMatchObject({ data: { code: 'E_FORBIDDEN' } });
  });

  it('allows report context after checking the report session owner', async () => {
    const engine = {
      extractTerms: vi.fn(),
      explainTerm: vi.fn().mockResolvedValue({
        term: 'CORS',
        title: 'CORS',
        shortDefinition: 'CORS — правила доступа между доменами.',
        explanation: 'CORS помогает браузеру ограничивать чтение ответов API.',
      }),
    };
    const service = new LearningTermsService({
      interviewRepository: createRepository(),
      reportRepository: createReportRepository(),
      engine,
    });

    await expect(
      service.explainTerm({
        anonymousSessionId: 'anon_1',
        input: {
          term: 'CORS',
          text: 'В отчёте упомянут CORS.',
          shortDefinition: 'CORS — правила доступа между доменами.',
          context: { kind: 'report', reportId: 'report_1' },
        },
      })
    ).resolves.toMatchObject({ term: 'CORS' });
    expect(engine.explainTerm).toHaveBeenCalledOnce();
  });
});

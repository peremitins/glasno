import { describe, expect, it, vi } from 'vitest';
import {
  LearningTermsService,
  buildExplainContextWindow,
} from './learningTermsService';

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

  it('serves extract results from cache without engine call or quota consumption', async () => {
    const cachedTerms = [
      { phrase: 'CORS', shortDefinition: 'CORS — правила доступа между доменами.' },
    ];
    const engine = {
      extractTerms: vi.fn(),
      explainTerm: vi.fn(),
    };
    const quota = { consume: vi.fn() };
    const service = new LearningTermsService({
      interviewRepository: createRepository(),
      reportRepository: createReportRepository(),
      engine,
      quota,
      cache: {
        getExtract: vi.fn().mockResolvedValue(cachedTerms),
        setExtract: vi.fn(),
        getExplanation: vi.fn().mockResolvedValue(null),
        setExplanation: vi.fn(),
      },
    });

    await expect(
      service.extractTerms({
        anonymousSessionId: 'anon_1',
        input: {
          items: [
            { id: 'item_1', text: 'Что такое CORS?', context: { kind: 'dashboard' } },
          ],
        },
      })
    ).resolves.toEqual({ items: [{ id: 'item_1', terms: cachedTerms }] });
    expect(engine.extractTerms).not.toHaveBeenCalled();
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it('consumes quota only for cache misses and stores fresh results', async () => {
    const cachedTerms = [
      { phrase: 'CORS', shortDefinition: 'CORS — правила доступа между доменами.' },
    ];
    const engine = {
      extractTerms: vi.fn().mockResolvedValue({
        items: [{ id: 'item_miss', terms: [] }],
      }),
      explainTerm: vi.fn(),
    };
    const quota = { consume: vi.fn().mockResolvedValue(undefined) };
    const setExtract = vi.fn();
    const service = new LearningTermsService({
      interviewRepository: createRepository(),
      reportRepository: createReportRepository(),
      engine,
      quota,
      cache: {
        getExtract: vi
          .fn()
          .mockImplementation(async (text: string) =>
            text.includes('CORS') ? cachedTerms : null
          ),
        setExtract,
        getExplanation: vi.fn().mockResolvedValue(null),
        setExplanation: vi.fn(),
      },
    });

    await expect(
      service.extractTerms({
        anonymousSessionId: 'anon_1',
        input: {
          items: [
            { id: 'item_hit', text: 'Что такое CORS?', context: { kind: 'dashboard' } },
            { id: 'item_miss', text: 'Обычный текст', context: { kind: 'dashboard' } },
          ],
        },
      })
    ).resolves.toEqual({
      items: [
        { id: 'item_hit', terms: cachedTerms },
        { id: 'item_miss', terms: [] },
      ],
    });
    expect(quota.consume).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'extract', amount: 1 })
    );
    expect(engine.extractTerms.mock.calls[0]?.[0].items).toHaveLength(1);
    expect(setExtract).toHaveBeenCalledWith('Обычный текст', []);
  });

  it('propagates quota errors without calling the engine', async () => {
    const engine = {
      extractTerms: vi.fn(),
      explainTerm: vi.fn(),
    };
    const service = new LearningTermsService({
      interviewRepository: createRepository(),
      reportRepository: createReportRepository(),
      engine,
      quota: {
        consume: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('limit'), { data: { code: 'E_RATE' } })
          ),
      },
    });

    await expect(
      service.explainTerm({
        anonymousSessionId: 'anon_1',
        input: {
          term: 'CORS',
          text: 'Что такое CORS?',
          context: { kind: 'dashboard' },
        },
      })
    ).rejects.toMatchObject({ data: { code: 'E_RATE' } });
    expect(engine.explainTerm).not.toHaveBeenCalled();
  });

  it('sends a windowed context to the engine for long explain texts', async () => {
    const engine = {
      extractTerms: vi.fn(),
      explainTerm: vi.fn().mockResolvedValue({
        term: 'CORS',
        title: 'CORS',
        shortDefinition: 'CORS — правила доступа между доменами.',
        explanation: 'CORS ограничивает чтение ответов между доменами.',
      }),
    };
    const service = new LearningTermsService({
      interviewRepository: createRepository(),
      reportRepository: createReportRepository(),
      engine,
    });

    const longText = `${'а'.repeat(900)} CORS ${'б'.repeat(900)}`;
    await service.explainTerm({
      anonymousSessionId: 'anon_1',
      input: { term: 'CORS', text: longText, context: { kind: 'dashboard' } },
    });

    const sentText = engine.explainTerm.mock.calls[0]?.[0].text as string;
    expect(sentText.length).toBeLessThan(longText.length);
    expect(sentText).toContain('CORS');
  });
});

describe('buildExplainContextWindow', () => {
  it('returns short texts unchanged', () => {
    expect(buildExplainContextWindow('Что такое CORS?', 'CORS')).toBe(
      'Что такое CORS?'
    );
  });

  it('cuts a window around the first occurrence of the term', () => {
    const text = `${'а'.repeat(900)} CORS ${'б'.repeat(900)}`;
    const window = buildExplainContextWindow(text, 'CORS');
    expect(window).toContain('CORS');
    expect(window.length).toBeLessThanOrEqual(2 * 300 + 'CORS'.length + 4);
    expect(window.startsWith('…')).toBe(true);
    expect(window.endsWith('…')).toBe(true);
  });

  it('falls back to the head of the text when the term is missing', () => {
    const text = 'в'.repeat(1500);
    const window = buildExplainContextWindow(text, 'CORS');
    expect(window.length).toBeLessThanOrEqual(601);
    expect(window.endsWith('…')).toBe(true);
  });
});

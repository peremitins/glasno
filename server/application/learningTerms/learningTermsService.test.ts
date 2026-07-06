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
  it('does not expose background extraction on the service', () => {
    const service = new LearningTermsService({
      interviewRepository: createRepository(),
      reportRepository: createReportRepository(),
      engine: {
        explainTerm: vi.fn(),
      },
    });

    expect('extractTerms' in service).toBe(false);
  });

  it('allows report context after checking the report session owner', async () => {
    const engine = {
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

  it('serves explanations from cache without engine call or quota consumption', async () => {
    const cachedExplanation = {
      term: 'CORS',
      title: 'CORS',
      shortDefinition: 'CORS — правила доступа между доменами.',
      explanation: 'CORS ограничивает чтение ответов между доменами.',
    };
    const engine = {
      explainTerm: vi.fn(),
    };
    const quota = { consume: vi.fn() };
    const service = new LearningTermsService({
      interviewRepository: createRepository(),
      reportRepository: createReportRepository(),
      engine,
      quota,
      cache: {
        getExplanation: vi.fn().mockResolvedValue(cachedExplanation),
        setExplanation: vi.fn(),
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
    ).resolves.toEqual(cachedExplanation);
    expect(engine.explainTerm).not.toHaveBeenCalled();
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it('consumes quota for explanation cache misses and stores fresh results', async () => {
    const response = {
      term: 'CORS',
      title: 'CORS',
      shortDefinition: 'CORS — правила доступа между доменами.',
      explanation: 'CORS ограничивает чтение ответов между доменами.',
    };
    const engine = {
      explainTerm: vi.fn().mockResolvedValue(response),
    };
    const quota = { consume: vi.fn().mockResolvedValue(undefined) };
    const setExplanation = vi.fn();
    const service = new LearningTermsService({
      interviewRepository: createRepository(),
      reportRepository: createReportRepository(),
      engine,
      quota,
      cache: {
        getExplanation: vi.fn().mockResolvedValue(null),
        setExplanation,
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
    ).resolves.toEqual(response);
    expect(quota.consume).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'explain', amount: 1 })
    );
    expect(engine.explainTerm).toHaveBeenCalledOnce();
    expect(setExplanation).toHaveBeenCalledWith(
      'CORS',
      'Что такое CORS?',
      response
    );
  });

  it('propagates quota errors without calling the engine', async () => {
    const engine = {
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

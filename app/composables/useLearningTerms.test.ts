import { describe, expect, it, vi } from 'vitest';
import type { LearningTermContext } from '@/shared/dto';
import {
  createLearningTermsBatcher,
  learningTermContextKey,
  learningTermTextHash,
} from './useLearningTerms';

describe('useLearningTerms helpers', () => {
  it('builds stable context keys independent of object property order', () => {
    const left: LearningTermContext = {
      kind: 'interview_question',
      interviewSessionId: 'session_1',
      turnId: 'turn_1',
      label: 'Вопрос',
    };
    const right: LearningTermContext = {
      label: 'Вопрос',
      turnId: 'turn_1',
      interviewSessionId: 'session_1',
      kind: 'interview_question',
    };

    expect(learningTermContextKey(left)).toBe(learningTermContextKey(right));
  });

  it('hashes text case-sensitively but normalizes surrounding whitespace', () => {
    expect(learningTermTextHash('  CORS  ')).toBe(learningTermTextHash('CORS'));
    expect(learningTermTextHash('CORS')).not.toBe(learningTermTextHash('cors'));
  });

  it('batches queued extraction requests and preserves item responses', async () => {
    vi.useFakeTimers();
    const requestExtract = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'one',
          terms: [
            {
              phrase: 'CORS',
              shortDefinition: 'CORS — правила доступа между доменами.',
            },
          ],
        },
        { id: 'two', terms: [] },
      ],
    });
    const batcher = createLearningTermsBatcher({
      debounceMs: 20,
      requestExtract,
    });

    const first = batcher.enqueue({
      id: 'one',
      text: 'Что такое CORS?',
      context: { kind: 'interview_question' },
    });
    const second = batcher.enqueue({
      id: 'two',
      text: 'Обычный вопрос без терминов.',
      context: { kind: 'interview_question' },
    });

    await vi.advanceTimersByTimeAsync(20);

    await expect(first).resolves.toEqual([
      {
        phrase: 'CORS',
        shortDefinition: 'CORS — правила доступа между доменами.',
      },
    ]);
    await expect(second).resolves.toEqual([]);
    expect(requestExtract).toHaveBeenCalledTimes(1);
    expect(requestExtract.mock.calls[0]?.[0].items).toHaveLength(2);
    vi.useRealTimers();
  });
});

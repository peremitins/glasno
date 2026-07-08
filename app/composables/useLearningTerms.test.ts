import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LearningTermContext } from '@/shared/dto';
import {
  learningTermContextKey,
  learningTermTextHash,
} from './useLearningTerms';

const source = readFileSync('app/composables/useLearningTerms.ts', 'utf8');
const removedBatcherName = ['create', 'Learning', 'Terms', 'Batcher'].join('');
const removedExtractFunction = ['extract', 'Terms', 'For', 'Text'].join('');
const removedExtractEndpoint = ['/api/learning/terms', 'extract'].join('/');

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

  it('does not expose background extraction helpers', () => {
    expect(source).not.toContain(removedBatcherName);
    expect(source).not.toContain(removedExtractFunction);
    expect(source).not.toContain(removedExtractEndpoint);
  });
});

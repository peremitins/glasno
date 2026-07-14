import { describe, expect, it } from 'vitest';
import { canonicalInterviewQuestionKey } from './interviewQuestion';

describe('interview question canonical key', () => {
  it('ignores numbering, spacing, case and terminal punctuation', () => {
    expect(canonicalInterviewQuestionKey('1. Расскажите  о проекте'))
      .toBe(canonicalInterviewQuestionKey('расскажите о проекте?!'));
  });
});

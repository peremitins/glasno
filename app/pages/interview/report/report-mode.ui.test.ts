import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./[id].vue', import.meta.url),
  'utf8'
);

describe('interviewer report UI', () => {
  it('uses mode-specific matrix labels for interviewer conversations', () => {
    expect(source).toContain('reportMatrixEyebrow');
    expect(source).toContain('reportMatrixTitle');
    expect(source).toContain('reportQuestionCountLabel');
    expect(source).toContain('report.interviewer.byQuestions');
    expect(source).toContain('report.interviewer.questionMatrix.title');
    expect(source).toContain('report.interviewer.questionMatrix.count');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/interview/[id].vue', 'utf8');

describe('interview session completion flow', () => {
  it('changes the next-question CTA to finish on the last question', () => {
    expect(source).toContain('isLastQuestion');
    expect(source).toContain('nextActionLabel');
    expect(source).toContain('interview.session.finishInterview');
    expect(source).toContain('{{ nextActionLabel }}');
  });

  it('finishes the last turn and immediately starts report generation', () => {
    expect(source).toContain('finishInterviewFromCurrentQuestion');
    expect(source).toMatch(
      /if \(isLastQuestion\.value\) \{\s*await finishInterviewFromCurrentQuestion\(turn\);\s*return;\s*\}/
    );
    expect(source).toContain('generateReport({ skipFlush: true })');
  });

  it('auto-starts report generation for completed sessions without the intermediate CTA screen', () => {
    expect(source).toContain('ReportGenerationPanel');
    expect(source).toContain('reportGenerationAutoStarted');
    expect(source).toMatch(/watch\(\s*isDone/);
    expect(source).not.toContain('done-actions');
    expect(source).not.toContain('@click="generateReport"');
  });
});

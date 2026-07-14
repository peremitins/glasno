import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ReportGenerationPanel.vue', import.meta.url),
  'utf8'
);

describe('ReportGenerationPanel', () => {
  it('uses interviewer-specific progress copy', () => {
    expect(source).toContain('trainingMode');
    expect(source).toContain('reportGeneration.interviewer.title');
    expect(source).toContain('reportGeneration.interviewer.steps.dialogue');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reportPage = readFileSync('app/pages/interview/report/[id].vue', 'utf8');
const dashboardPage = readFileSync('app/pages/index.vue', 'utf8');
const termComponent = readFileSync(
  'app/components/design/InterviewTerm.vue',
  'utf8'
);

describe('interview terminology UI', () => {
  it('uses a tooltip-enabled term component for STAR', () => {
    expect(termComponent).toContain('v-tooltip');
    expect(termComponent).toContain(':title=');
    expect(termComponent).toContain('tabindex="0"');
    expect(termComponent).toContain('common.terms.star.description');
    expect(termComponent).toContain('term-tooltip');
  });

  it('wraps dynamic report and dashboard text with term-aware rendering', () => {
    expect(reportPage).toContain('TextWithInterviewTerms');
    expect(dashboardPage).toContain('TextWithInterviewTerms');
    expect(reportPage).toContain('report.modelAnswer');
    expect(reportPage).toContain('report.strongerStar');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reportPage = readFileSync('app/pages/interview/report/[id].vue', 'utf8');
const dashboardPage = readFileSync('app/pages/index.vue', 'utf8');
const termComponent = readFileSync(
  'app/components/design/InterviewTerm.vue',
  'utf8'
);
const textWithTermsComponent = readFileSync(
  'app/components/design/TextWithInterviewTerms.vue',
  'utf8'
);

describe('interview terminology UI', () => {
  it('uses a tooltip-enabled term component without changing text metrics', () => {
    expect(termComponent).toContain('v-tooltip');
    expect(termComponent).toContain(':title=');
    expect(termComponent).toContain('VDropdown');
    expect(termComponent).toContain('class="term-popper"');
    expect(termComponent).toContain(':auto-hide="true"');
    expect(termComponent).toContain('@auto-hide');
    expect(termComponent).toContain('@close-directive');
    expect(termComponent).toContain('Cross2Icon');
    expect(termComponent).toContain('Закрыть объяснение');
    expect(termComponent).toContain("theme: 'learning-term-tooltip'");
    expect(termComponent).toContain('type="button"');
    expect(termComponent).not.toContain('term-tooltip__mark');
    expect(termComponent).not.toContain('display: inline-flex');
    expect(termComponent).not.toContain('font-weight: 900');
    expect(termComponent).not.toContain('tabindex="0"');
    expect(termComponent).toContain('background: var(--surface-solid) !important');
    expect(termComponent).not.toContain('background: var(--surface) !important');
    expect(termComponent).toContain('common.terms.star.description');
    expect(termComponent).toContain('term-tooltip');
  });

  it('keeps dynamic terms stable while background extraction refreshes', () => {
    expect(textWithTermsComponent).toContain('filterTermsForText');
    expect(textWithTermsComponent).not.toContain('dynamicTerms.value = []');
    expect(textWithTermsComponent).toContain('}, 700)');
  });

  it('wraps dynamic report and dashboard text with term-aware rendering', () => {
    expect(reportPage).toContain('TextWithInterviewTerms');
    expect(dashboardPage).toContain('TextWithInterviewTerms');
    expect(reportPage).toContain('report.modelAnswer');
    expect(reportPage).toContain('report.strongerStar');
    expect(reportPage).toContain("kind: 'report'");
    expect(reportPage).toContain(':context=');
    expect(dashboardPage).toContain("kind: 'dashboard'");
    expect(dashboardPage).toContain(':interactive="false"');
  });
});

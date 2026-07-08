import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reportPage = readFileSync('app/pages/interview/report/[id].vue', 'utf8');
const dashboardPage = readFileSync('app/pages/index.vue', 'utf8');
const termComponent = readFileSync(
  'app/components/design/InterviewTerm.vue',
  'utf8'
);
const floatingVuePlugin = readFileSync(
  'app/plugins/floating-vue.client.ts',
  'utf8'
);
const textWithTermsComponent = readFileSync(
  'app/components/design/TextWithInterviewTerms.vue',
  'utf8'
);
const removedCandidateType = ['Learning', 'Term', 'Candidate'].join('');
const removedExtractFunction = ['extract', 'Terms', 'For', 'Text'].join('');

describe('interview terminology UI', () => {
  it('uses a tooltip-enabled term component without changing text metrics', () => {
    expect(termComponent).toContain('v-tooltip');
    expect(termComponent).toContain(':title=');
    expect(termComponent).not.toContain('VDropdown');
    expect(termComponent).not.toContain('explainable?: boolean');
    expect(termComponent).not.toContain('const canExplain = computed');
    expect(termComponent).not.toContain('class="term-popper"');
    expect(termComponent).not.toContain(':auto-hide="true"');
    expect(termComponent).not.toContain('Cross2Icon');
    expect(termComponent).not.toContain('Закрыть объяснение');
    expect(termComponent).not.toContain('explainTerm');
    expect(termComponent).not.toContain('shortDefinition');
    expect(termComponent).toContain("theme: 'learning-term-tooltip'");
    expect(termComponent).toContain("placement: 'top'");
    expect(termComponent).not.toContain('type="button"');
    expect(termComponent).not.toContain('term-tooltip__mark');
    expect(termComponent).not.toContain('display: inline-flex');
    expect(termComponent).not.toContain('font-weight: 900');
    // Не-интерактивный термин остаётся доступен с клавиатуры (focus-триггер).
    expect(termComponent).toContain('tabindex="0"');
    expect(termComponent).toContain('background: var(--surface-solid) !important');
    expect(termComponent).not.toContain('background: var(--surface) !important');
    expect(termComponent).toContain('common.terms.star.description');
    expect(termComponent).toContain('term-tooltip');
  });

  it('keeps static STAR as the only automatic inline term', () => {
    expect(termComponent).toContain("term: 'star'");
    expect(termComponent).toContain('common.terms.star.description');
    expect(textWithTermsComponent).toContain('splitTextByInterviewTerms(props.text)');
    expect(textWithTermsComponent).not.toContain(':explainable=');
    expect(textWithTermsComponent).not.toContain(':interactive="interactive"');
    expect(textWithTermsComponent).not.toContain(removedCandidateType);
  });

  it('configures Floating Vue custom themes and keeps long inline terms left-aligned', () => {
    expect(floatingVuePlugin).toContain("'learning-term-tooltip'");
    expect(floatingVuePlugin).toContain("$extend: 'tooltip'");
    expect(termComponent).toContain('text-align: left');
    expect(termComponent).toContain('white-space: normal');
    expect(termComponent).toContain('displayLabelParts');
    expect(termComponent).toContain('<wbr');
    expect(termComponent).toContain('term-tooltip__label');
    expect(termComponent).toContain('term-tooltip__punctuation');
    expect(termComponent).toContain('overflow-wrap: anywhere');
    expect(textWithTermsComponent).toContain('prepareInterviewTextDisplaySegments');
    expect(textWithTermsComponent).toContain(':attached-punctuation=');
    expect(floatingVuePlugin).not.toContain("'learning-term'");
    expect(floatingVuePlugin).not.toContain("$extend: 'dropdown'");
  });

  it('does not run background extraction for hover definitions', () => {
    expect(textWithTermsComponent).not.toContain('filterTermsForText');
    expect(textWithTermsComponent).not.toContain('scheduleTermLoad');
    expect(textWithTermsComponent).not.toContain(removedExtractFunction);
    expect(textWithTermsComponent).not.toContain('IntersectionObserver');
    expect(textWithTermsComponent).not.toContain('}, 700)');
  });

  it('wraps dynamic report and dashboard text with term-aware rendering', () => {
    expect(reportPage).toContain('TextWithInterviewTerms');
    expect(dashboardPage).toContain('TextWithInterviewTerms');
    expect(reportPage).toContain('report.modelAnswer');
    expect(reportPage).toContain('report.strongerStar');
    expect(reportPage).toContain("kind: 'report'");
    expect(reportPage).toContain(':context=');
    expect(dashboardPage).toContain("kind: 'dashboard'");
    expect(dashboardPage).not.toContain(':interactive=');
  });
});

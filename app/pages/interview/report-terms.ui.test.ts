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

describe('interview terminology UI', () => {
  it('uses a tooltip-enabled term component without changing text metrics', () => {
    expect(termComponent).toContain('v-tooltip');
    expect(termComponent).toContain(':title=');
    expect(termComponent).toContain('VDropdown');
    expect(termComponent).toContain('explainable?: boolean');
    expect(termComponent).toContain('const canExplain = computed');
    expect(termComponent).toContain("props.term !== 'star'");
    expect(termComponent).toContain('v-if="canExplain"');
    expect(termComponent).toContain('class="term-popper"');
    expect(termComponent).toContain(':auto-hide="true"');
    expect(termComponent).toContain('@auto-hide');
    expect(termComponent).toContain('@close-directive');
    expect(termComponent).toContain('Cross2Icon');
    expect(termComponent).toContain('Закрыть объяснение');
    expect(termComponent).toContain("theme: 'learning-term-tooltip'");
    expect(termComponent).toContain("placement: 'top'");
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

  it('keeps static STAR as tooltip-only while dynamic terms remain explainable', () => {
    expect(termComponent).toContain('watch(isShown, (shown) => {');
    expect(termComponent).toContain('if (!canExplain.value) return');
    expect(termComponent).toContain('if (!canExplain.value || explanation.value');
    expect(textWithTermsComponent).toContain(
      `:explainable="segment.term !== 'star'"`
    );
    expect(textWithTermsComponent).toContain(':interactive="interactive"');
  });

  it('configures Floating Vue custom themes and keeps long inline terms left-aligned', () => {
    expect(floatingVuePlugin).toContain("'learning-term-tooltip'");
    expect(floatingVuePlugin).toContain("$extend: 'tooltip'");
    expect(floatingVuePlugin).toContain("'learning-term'");
    expect(floatingVuePlugin).toContain("$extend: 'dropdown'");
    expect(termComponent).toContain('text-align: left');
    expect(termComponent).toContain('white-space: normal');
    expect(termComponent).toContain('displayLabelParts');
    expect(termComponent).toContain('<wbr');
    expect(termComponent).toContain('term-tooltip__label');
    expect(termComponent).toContain('term-tooltip__punctuation');
    expect(termComponent).toContain('overflow-wrap: anywhere');
    expect(textWithTermsComponent).toContain('prepareInterviewTextDisplaySegments');
    expect(textWithTermsComponent).toContain(':attached-punctuation=');
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

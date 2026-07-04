import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(
  'app/components/design/TextWithInterviewTerms.vue',
  'utf8'
);
const interviewPage = readFileSync('app/pages/interview/[id].vue', 'utf8');
const reportPage = readFileSync('app/pages/interview/report/[id].vue', 'utf8');
const dashboardPage = readFileSync('app/pages/index.vue', 'utf8');
const historyPage = readFileSync('app/pages/history.vue', 'utf8');
const pricingPage = readFileSync('app/pages/pricing.vue', 'utf8');
const layout = readFileSync('app/layouts/default.vue', 'utf8');

describe('manual learning term selection UI', () => {
  it('keeps manual selection opt-in inside TextWithInterviewTerms', () => {
    expect(component).toContain('manualSelection');
    expect(component).toContain('manual-selection-action');
    expect(component).toContain('manual-selection-popover');
    expect(component).toContain('normalizeManualLearningTermSelection');
    expect(component).toContain('clampLearningTermFloatingPosition');
    expect(component).toContain('isEditableLearningTermSelectionTarget');
    expect(component).toContain('explainTerm');
    expect(component).toContain('Escape');
    expect(component).not.toContain('@contextmenu');
  });

  it('enables manual selection only in active interview text surfaces', () => {
    expect(interviewPage).toContain('manual-selection');
    expect(interviewPage).toContain("learningTermContext('interview_question'");
    expect(interviewPage).toContain("learningTermContext('interview_message'");
    expect(interviewPage).toContain("learningTermContext('interview_hint'");
  });

  it('enables manual selection throughout the report explanation surfaces', () => {
    expect(reportPage).toContain('manual-selection');
    expect(reportPage).toContain('report.verdict');
    expect(reportPage).toContain('report.summary');
    expect(reportPage).toContain('item.question');
    expect(reportPage).toContain('item.answer');
    expect(reportPage).toContain('item.modelAnswer');
    expect(reportPage).toContain('item.strongerAnswerStar');
  });

  it('does not enable manual selection on non-interview money/navigation surfaces', () => {
    expect(dashboardPage).not.toContain('manual-selection');
    expect(historyPage).not.toContain('manual-selection');
    expect(pricingPage).not.toContain('manual-selection');
    expect(layout).not.toContain('manual-selection');
  });
});

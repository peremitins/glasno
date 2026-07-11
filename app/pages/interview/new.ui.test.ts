import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('app/pages/interview/new.vue', 'utf8');

describe('interview new page UI structure', () => {
  it('offers candidate and interviewer training modes before the source fields', () => {
    const modeIndex = source.indexOf('class="training-mode-grid"');
    const sourceIndex = source.indexOf('id="vacancy"');

    expect(modeIndex).toBeGreaterThan(-1);
    expect(modeIndex).toBeLessThan(sourceIndex);
    expect(source).toContain("type TrainingMode = CreateInterviewSessionRequest['trainingMode']");
    expect(source).toContain("value: 'candidate'");
    expect(source).toContain("value: 'interviewer'");
    expect(source).toContain('interview.new.trainingMode.candidate.title');
    expect(source).toContain('interview.new.trainingMode.interviewer.title');
  });

  it('replaces candidate experience with AI candidate setup in interviewer mode', () => {
    expect(source).toContain('isInterviewerTraining');
    expect(source).toContain('interview.new.aiCandidate.title');
    expect(source).toContain('interview.new.aiCandidate.resumeFile');
    expect(source).toContain('candidatePersonaOptions');
    expect(source).toContain('candidateDifficultyOptions');
    expect(source).toContain('id="candidate-notes"');
  });

  it('keeps resume file preview next to the upload before candidate notes', () => {
    const uploadIndex = source.indexOf('id="resume-file"');
    const previewIndex = source.indexOf('class="resume-preview"');
    const notesIndex = source.indexOf('id="resume-notes"');

    expect(uploadIndex).toBeGreaterThan(-1);
    expect(previewIndex).toBeGreaterThan(uploadIndex);
    expect(notesIndex).toBeGreaterThan(previewIndex);
  });

  it('does not show a redundant candidate context status badge', () => {
    expect(source).not.toContain('context-status');
    expect(source).not.toContain('interview.new.candidate.ready');
  });

  it('does not render specialization or skip-resume as separate primary controls', () => {
    expect(source).not.toContain('id="specialization"');
    expect(source).not.toContain('skipCandidateContext');
    expect(source).not.toContain('interview.new.candidate.skip');
  });

  it('lets users remove an uploaded resume from the preview', () => {
    expect(source).toContain('function clearResumeFile()');
    expect(source).toContain('resume-preview__clear');
    expect(source).toContain('interview.new.resume.clearFile');
  });

  it('stacks source tabs on narrow mobile screens', () => {
    expect(source).toContain('@media (max-width: 480px)');
    expect(source).toContain('.source-tabs');
    expect(source).toContain('grid-template-columns: 1fr');
  });

  it('offers only link and manual source tabs', () => {
    expect(source).toContain("type SourceMode = 'hh_url' | 'manual'");
    expect(source).toContain("label: 'interview.new.source.manual'");
    expect(source).not.toContain("label: 'interview.new.source.text'");
    expect(source).not.toContain("label: 'interview.new.source.profession'");
  });

  it('keeps custom role selection discoverable in manual mode', () => {
    expect(source).toContain('customRoleOption');
    expect(source).toContain('interview.new.roles.customAction');
    expect(source).toContain('PROFESSIONAL_ROLE_OPTIONS');
  });

  it('drops the broken top step navigator in favor of the sticky summary', () => {
    expect(source).not.toContain('section-nav__item');
    expect(source).not.toContain('sectionAnchors');
    expect(source).not.toContain('IntersectionObserver');
    expect(source).toContain('sticky-start-bar');
  });

  it('renders role-aware context tags only after a role is chosen', () => {
    expect(source).toContain('getRoleContextTags');
    expect(source).toContain('visibleContextTags');
    expect(source).toContain('v-if="form.professionRole.trim()"');
  });

  it('exposes selection controls as real radio options', () => {
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain('role="radio"');
    expect(source).toContain(':aria-checked');
  });

  it('uses focusable help buttons for tooltips', () => {
    expect(source).toContain('class="help-button"');
    expect(source).toContain('type="button"');
    expect(source).not.toContain('class="source-help"');
  });

  it('keeps interview focus as one chip selector without a competing dropdown', () => {
    expect(source).toContain('focus-chip-grid');
    expect(source).toContain('interview.focus.salaryNegotiation');
    expect(source).not.toContain('focus-select');
  });

  it('closes the custom profession menu and returns focus to the input', () => {
    expect(source).toContain('focusProfessionRoleInput');
    expect(source).toContain('selection.focusInput');
    expect(source).toContain("document.getElementById('profession-role')");
  });

  it('does not open the profession dropdown from the input model setter', () => {
    const setterStart = source.indexOf('set: (value: string) => {');
    const setterEnd = source.indexOf('},', setterStart);
    const setter = source.slice(setterStart, setterEnd);

    expect(setter).not.toContain('rolePickerRequested.value = true');
    expect(setter).not.toContain('rolePickerOpen.value = true');
    expect(source).toContain('function openRolePicker()');
  });

  it('does not render a redundant top hero block', () => {
    expect(source).not.toContain('setup-hero');
    expect(source).not.toContain('hero-meter');
  });

  it('shows a blocking preparation overlay while the interview is being created', () => {
    expect(source).toContain('interview-start-overlay');
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('interview.new.preparing.title');
    expect(source).toContain('preparationSteps');
    expect(source).toContain('isSubmitting');
  });

  it('keeps a sticky start summary with default standard duration copy', () => {
    expect(source).toContain('sticky-start-bar');
    expect(source).toContain('selectedGoalSummary');
    expect(source).toContain('15 мин');
  });

  it('aligns the mobile sticky start bar with the reserved bottom navigation area', () => {
    expect(source).toMatch(
      /@media \(max-width: 640px\)\s*{\s*\.sticky-start-bar\s*{[\s\S]*?bottom:\s*0;/
    );
  });

  it('constrains the teleported role menu to the viewport', () => {
    const globalStyle = source.slice(source.lastIndexOf('<style>'));

    expect(globalStyle).toContain('calc(100vw - 28px)');
    expect(globalStyle).toContain('!important');
  });

  it('keeps teleported role menu options globally styleable', () => {
    const globalStyle = source.slice(source.lastIndexOf('<style>'));

    expect(globalStyle).toContain('.role-option');
    expect(globalStyle).toContain('.role-empty');
    expect(globalStyle).toContain('::-webkit-scrollbar');
  });
});

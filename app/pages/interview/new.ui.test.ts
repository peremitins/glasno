import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('app/pages/interview/new.vue', 'utf8');

describe('interview new page UI structure', () => {
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

  it('constrains the teleported role menu to the viewport', () => {
    const globalStyle = source.slice(source.lastIndexOf('<style>'));

    expect(globalStyle).toContain('calc(100vw - 28px)');
    expect(globalStyle).toContain('!important');
  });
});

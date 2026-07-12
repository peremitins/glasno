import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../../composables/useLandingContent';

const source = readFileSync(
  'apps/landing/components/landing/ReportSection.vue',
  'utf8'
);

describe('ReportSection', () => {
  it('describes only the criteria and recommendations that the actual report provides', () => {
    const { report } = useLandingContent();

    expect(report.metrics.map(({ label }) => label)).toEqual([
      'Суть ответа',
      'Структура',
      'Подача',
    ]);
    expect(report.scoreNote).toContain('сути, структуре и подаче');
    expect(report.fixesLabel).toBe('Главные улучшения после тренировки');
    expect(report.fixes).toHaveLength(3);
  });

  it('opens a full report preview with question-level detail and a PDF example', () => {
    const { report } = useLandingContent();

    expect(report.previewCta).toBe('Посмотреть полный пример отчёта');
    expect(report.examplePdfSrc).toBe('/reports/example-interview-report.pdf');
    expect(source).toContain('report-preview-dialog');
    expect(source).toContain('report.preview.questions');
    expect(source).toContain('report.examplePdfSrc');
  });

  it('keeps scrolling inside the full-screen preview and preserves its outer frame', () => {
    expect(source).toContain('lockPageScroll');
    expect(source).toContain('unlockPageScroll');
    expect(source).toContain('@close="unlockPageScroll"');
    expect(source).toMatch(
      /\.report-preview-dialog\s*{[^}]*width:\s*calc\(100vw - 64px\);[^}]*height:\s*calc\(100vh - 64px\);[^}]*overflow:\s*hidden;/
    );
    expect(source).toMatch(
      /\.report-preview-dialog__body\s*{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;[^}]*scrollbar-gutter:\s*stable;/
    );
  });

  it('does not let Lenis capture the dialog wheel events or keep a closed dialog visible', () => {
    expect(source).toContain('data-lenis-prevent');
    expect(source).toMatch(
      /\.report-preview-dialog:not\(\[open\]\)\s*{\s*display:\s*none;/
    );
    expect(source).toMatch(
      /\.report-preview-dialog\[open\]\s*{\s*display:\s*flex;/
    );
  });
});

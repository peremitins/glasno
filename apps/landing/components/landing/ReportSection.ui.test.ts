import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../../composables/useLandingContent';

const source = readFileSync(
  'apps/landing/components/landing/ReportSection.vue',
  'utf8'
);

describe('ReportSection', () => {
  it('centres the wider introduction above the report preview', () => {
    expect(source).toMatch(
      /<SectionHeading[\s\S]*:lead="report\.lead"[\s\S]*align="center"/
    );
  });

  it('uses the selected frontend interview report as the landing example', () => {
    const { report } = useLandingContent();

    expect(report.metrics.map(({ label }) => label)).toEqual([
      'Суть ответа',
      'Структура',
      'Подача',
    ]);
    expect(report.metrics.map(({ value }) => value)).toEqual([55, 70, 72]);
    expect(report.score).toBe(62);
    expect(report.verdict).toContain('релизной надежности');
    expect(report.scoreNote).toContain('computed vs watch');
    expect(report.fixes).toHaveLength(4);
    expect(report.fixes[0]).toContain('конфиденциальность');
    expect(report.preview.questions).toHaveLength(3);
    expect(report.preview.questions.map(({ question }) => question)).toEqual([
      'Начнём с простого. Чем computed отличается от watch во Vue 3?',
      'Теперь вопрос про безопасность. Как бы вы обеспечили конфиденциальность пользовательских данных?',
      'Представьте, что вам нужно выпустить новый интерфейс для приложения с миллиардной аудиторией. Как вы снизите риск ошибок при обновлении?',
    ]);
    expect(report.preview.questions.map(({ score }) => score)).toEqual([74, 0, 77]);
  });

  it('opens the full report preview without an obsolete PDF example', () => {
    const { report } = useLandingContent();

    expect(report.previewCta).toBe('Посмотреть полный пример отчёта');
    expect(source).toContain('report-preview-dialog');
    expect(source).toContain('report.preview.questions');
    expect(source).toContain('{{ question.score }}');
    expect(source).not.toContain('examplePdfSrc');
    expect(source).not.toContain('Открыть PDF-пример');
    expect(
      existsSync('apps/landing/public/reports/example-interview-report.pdf')
    ).toBe(false);
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

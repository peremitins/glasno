import { describe, expect, it } from 'vitest';
import {
  REPORT_PDF_MODEL_ANSWER_LABEL,
  REPORT_PDF_STAR_LABEL,
  formatReportPdfText,
  reportPdfCriteriaLabel,
} from './reportPdf';

describe('report pdf labels', () => {
  it('uses reader-friendly report wording', () => {
    expect(reportPdfCriteriaLabel('brevity')).toBe('Краткость и ясность');
    expect(REPORT_PDF_MODEL_ANSWER_LABEL).toBe('Вариант сильного ответа');
    expect(REPORT_PDF_STAR_LABEL).toContain(
      'STAR: ситуация, задача, действие, результат'
    );
  });

  it('expands STAR inside dynamic pdf text', () => {
    expect(formatReportPdfText('Структурировать ответ по STAR')).toBe(
      'Структурировать ответ по STAR (ситуация, задача, действие, результат)'
    );
    expect(
      formatReportPdfText(
        'Структурировать ответ по STAR (ситуация, задача, действие, результат)'
      )
    ).toBe(
      'Структурировать ответ по STAR (ситуация, задача, действие, результат)'
    );
  });
});

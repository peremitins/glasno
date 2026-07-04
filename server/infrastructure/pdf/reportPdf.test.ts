import { describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
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

  it('prints per-question criteria in pdf reports', async () => {
    const { renderReportPdf } = await import('./reportPdf');
    const pdf = await renderReportPdf({
      id: 'report_1',
      sessionId: 'session_1',
      status: 'done',
      overallScore: 82,
      verdict: 'Хороший ответ.',
      summary: 'Есть база для усиления.',
      criteria: {
        structure: 80,
        specificity: 70,
        relevance: 90,
        confidence: 78,
        riskPhrases: 84,
        brevity: 88,
      },
      recommendations: { topFixes: ['Добавить цифры'] },
      questionAnalysis: [
        {
          turnId: 'turn_1',
          kind: 'clarification',
          question: 'Какой был результат?',
          answer: 'Конверсия выросла до 18%.',
          criteria: {
            structure: 74,
            specificity: 86,
            relevance: 92,
            confidence: 80,
            riskPhrases: 90,
            brevity: 78,
          },
          whatWorked: 'Есть результат.',
          whatWeak: 'Не указан период.',
          modelAnswer: '',
          strongerAnswerStar: 'Добавить период и базовое значение.',
          nextPractice: 'Подготовить цифры по кейсам.',
        },
      ],
      errorMessage: null,
      model: 'gpt-4o-mini',
      createdAt: '2026-06-28T10:10:00.000Z',
      updatedAt: '2026-06-28T10:11:00.000Z',
    });

    const parser = new PDFParse({ data: pdf });
    try {
      const result = await parser.getText();
      expect(result.text).toContain('Оценки по вопросу');
      expect(result.text).toContain('Конкретика: 86/100');
    } finally {
      await parser.destroy();
    }
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

import { describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import {
  REPORT_PDF_MODEL_ANSWER_LABEL,
  REPORT_PDF_STAR_LABEL,
  formatReportPdfText,
  reportPdfCriteriaLabel,
  reportPdfCriteriaLabelForMode,
} from './reportPdf';

describe('report pdf labels', () => {
  it('uses reader-friendly report wording', () => {
    expect(reportPdfCriteriaLabel('substance')).toBe('Суть ответа');
    expect(reportPdfCriteriaLabel('delivery')).toBe('Подача');
    expect(reportPdfCriteriaLabelForMode('substance', 'interviewer')).toBe(
      'Качество проверки'
    );
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
      trainingMode: 'candidate',
      status: 'done',
      overallScore: 82,
      verdict: 'Хороший ответ.',
      summary: 'Есть база для усиления.',
      criteria: {
        substance: 90,
        structure: 80,
        delivery: 78,
      },
      recommendations: { topFixes: ['Добавить цифры'] },
      questionAnalysis: [
        {
          turnId: 'turn_1',
          kind: 'clarification',
          question: 'Какой был результат?',
          answer: 'Конверсия выросла до 18%.',
          criteria: {
            substance: 92,
            structure: 74,
            delivery: 80,
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
      expect(result.text).toContain('Суть ответа: 92/100');
      // Кириллица должна остаться читаемой: встроенные шрифты pdfkit её ломают.
      expect(result.text).toContain('Итоговый балл: 82 / 100');
      expect(result.text).toContain('Конверсия выросла до 18%.');
    } finally {
      await parser.destroy();
    }
  });

  it('prints interviewer conversations with interviewer-specific labels', async () => {
    const { renderReportPdf } = await import('./reportPdf');
    const pdf = await renderReportPdf({
      id: 'report_interviewer',
      sessionId: 'session_interviewer',
      trainingMode: 'interviewer',
      status: 'done',
      overallScore: 78,
      verdict: 'Интервью проведено последовательно.',
      summary: 'Нужно усилить уточняющие вопросы.',
      criteria: { substance: 80, structure: 82, delivery: 72 },
      recommendations: { topFixes: ['Уточнять личный вклад кандидата'] },
      questionAnalysis: [
        {
          turnId: 'turn_1',
          kind: 'main',
          question: 'Опыт и профессиональные решения',
          answer: 'Вы: Расскажите о сложном проекте?\nAI-кандидат: Я вёл редизайн.',
          criteria: { substance: 80, structure: 82, delivery: 72 },
          whatWorked: 'Есть открытый вопрос.',
          whatWeak: 'Нет уточнения результата.',
          modelAnswer: 'Какой результат получили?',
          strongerAnswerStar: 'Уточнить личный вклад.',
          nextPractice: 'Подготовить два уточнения.',
        },
      ],
      errorMessage: null,
      model: 'gpt-test',
      createdAt: '2026-07-14T10:00:00.000Z',
      updatedAt: '2026-07-14T10:01:00.000Z',
    });

    const parser = new PDFParse({ data: pdf });
    try {
      const result = await parser.getText();
      expect(result.text).toContain('Разбор ведения интервью');
      expect(result.text).toContain('Фрагмент разговора: Вы:');
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

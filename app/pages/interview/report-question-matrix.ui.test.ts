import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/interview/report/[id].vue', 'utf8');
const messages = JSON.parse(readFileSync('app/i18n/locales/ru.json', 'utf8'));

describe('interview report question matrix UI', () => {
  it('renders question-answer rows with per-criterion score cells', () => {
    expect(source).toContain('reportQuestionRows');
    expect(source).toContain('scorePillStyle');
    expect(source).toContain('openQuestionIds');
    expect(source).toContain('toggleQuestion');
    expect(source).toContain('isQuestionOpen');
    expect(source).toContain('averageScore');
    expect(source).not.toContain('shortLabel');
    expect(source).toContain('question-row__summary');
    expect(source).toContain('question-score-strip');
    expect(source).toContain('question-row__details');
    expect(source).toContain('question-score-grid');
    expect(source).toContain('criteria-breakdown');
    expect(source).toContain('chartOptions');
    expect(source).toContain('responsive:');
    expect(source).toContain('question-answer-block');
    expect(source).toContain('question-kind');
    expect(source).toContain('report.questionMatrix.title');
    expect(source).toContain('report.questionMatrix.scoreAria');
  });

  it('has concise Russian labels for the question matrix', () => {
    expect(messages.report.questionMatrix.title).toBe('Вопросы, ответы и оценки');
    expect(messages.report.questionMatrix.main).toBe('Основной вопрос');
    expect(messages.report.questionMatrix.clarification).toBe('Уточнение');
    expect(messages.report.questionMatrix.noScore).toBe('Нет оценки');
    expect(messages.report.questionMatrix.count).toBe(
      '{count} вопросов в отчёте'
    );
    expect(messages.report.questionMatrix.expand).toBe('Развернуть');
    expect(messages.report.questionMatrix.collapse).toBe('Свернуть');
    expect(messages.report.questionMatrix.average).toBe('Средний балл');
  });

  it('keeps collapsed question summaries compact and non-interactive', () => {
    const summaryStart = source.indexOf('class="question-row__summary"');
    const summaryEnd = source.indexOf('class="question-row__details"', summaryStart);
    const summaryBlock = source.slice(summaryStart, summaryEnd);

    expect(summaryBlock).toContain(':aria-expanded=');
    expect(summaryBlock).toContain('@click="toggleQuestion(row.item.turnId)"');
    expect(summaryBlock).toContain('{{ row.item.question }}');
    expect(summaryBlock).toContain('question-summary-text');
    expect(summaryBlock).toContain('question-score-strip');
    expect(summaryBlock).toContain('score-mini__value');
    expect(summaryBlock).toContain('sr-only');
    expect(summaryBlock).not.toContain('score.shortLabel');
    expect(summaryBlock).not.toContain('question-toggle-label');
    expect(summaryBlock).not.toContain('TextWithInterviewTerms');
  });

  it('keeps mobile summary and criteria chart readable', () => {
    expect(source).toContain('.criteria-chart-shell');
    expect(source).toContain('.criteria-breakdown');
    expect(source).toContain('.criteria-breakdown__bar');
    expect(source).toContain('grid-template-columns: repeat(6, minmax(0, 1fr))');
    expect(source).toContain('@media (max-width: 520px)');
    expect(source).toContain('.question-score-strip {');
    expect(source).not.toContain('.question-score-strip {\n      grid-template-columns: 1fr;');
    expect(source).not.toContain('.question-row__summary:hover,\n  .question-row__summary:focus-visible');
  });
});

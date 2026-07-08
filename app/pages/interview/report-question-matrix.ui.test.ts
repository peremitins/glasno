import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/interview/report/[id].vue', 'utf8');
const messages = JSON.parse(readFileSync('app/i18n/locales/ru.json', 'utf8'));

describe('interview report question matrix UI', () => {
  it('switches report labels for interviewer training reports', () => {
    expect(source).toContain('isInterviewerTraining');
    expect(source).toContain('criteriaLabelKey');
    expect(source).toContain('report.interviewer.answer');
    expect(source).toContain('report.interviewer.modelAnswer');
    expect(source).toContain('report.interviewer.strongerStar');
  });

  it('renders question-answer rows with per-criterion score cells', () => {
    expect(source).toContain('reportQuestionRows');
    expect(source).toContain('scorePillStyle');
    expect(source).toContain('openQuestionIds');
    expect(source).toContain('toggleQuestion');
    expect(source).toContain('isQuestionOpen');
    expect(source).toContain('averageScore');
    expect(source).not.toContain('shortLabel');
    expect(source).toContain('question-row__summary');
    expect(source).toContain('score-average');
    expect(source).not.toContain('question-score-strip');
    expect(source).toContain('question-row__details');
    expect(source).toContain('question-score-grid');
    expect(source).toContain('criteria-bars');
    expect(source).toContain('criteria-bar__fill');
    expect(source).not.toContain('chartOptions');
    expect(source).not.toContain('type="radar"');
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
    // Свёрнуто показываем только средний балл, без дублирования критериев.
    expect(summaryBlock).toContain('score-average');
    expect(summaryBlock).toContain('report.questionMatrix.average');
    expect(summaryBlock).not.toContain('question-score-strip');
    expect(summaryBlock).not.toContain('score-mini');
    expect(summaryBlock).not.toContain('score-pill');
    expect(summaryBlock).not.toContain('score.shortLabel');
    expect(summaryBlock).not.toContain('question-toggle-label');
    expect(summaryBlock).not.toContain('TextWithInterviewTerms');
  });

  it('keeps criteria as three responsive bars with tooltips instead of a radar chart', () => {
    expect(source).toContain('.criteria-bars');
    expect(source).toContain('.criteria-bar__fill');
    expect(source).toContain('.criteria-bar__hint');
    expect(source).not.toContain('criteria-chart-shell');
    expect(source).not.toContain('apexcharts');
    // Три критерия, а не шесть.
    expect(source).not.toContain('repeat(6, minmax(0, 1fr))');
    expect(source).toContain('@media (max-width: 520px)');
    expect(source).not.toContain('.question-score-strip {');
  });

  it('shows per-question criteria as full-width bars below the answer', () => {
    // Критерии идут после блока «вопрос+ответ», а не рядом с ним.
    const answerBlockIdx = source.indexOf('class="question-answer-block"');
    const detailGridIdx = source.indexOf('question-score-grid--detail');
    expect(answerBlockIdx).toBeGreaterThan(-1);
    expect(detailGridIdx).toBeGreaterThan(answerBlockIdx);

    // Тело развёрнутого вопроса больше не делится пополам.
    expect(source).toContain('grid-template-columns: minmax(0, 1fr);');
    // Бары критериев переносятся сами при нехватке места.
    expect(source).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))'
    );
  });

  it('exposes a hint tooltip describing each criterion', () => {
    expect(source).toContain("v-tooltip");
    expect(source).toContain('report.criteria.hintAria');
    expect(source).toContain('QuestionMarkCircledIcon');
    expect(messages.report.criteria.substance).toBe('Суть ответа');
    expect(messages.report.criteria.structure).toBe('Структура');
    expect(messages.report.criteria.delivery).toBe('Подача');
    expect(messages.report.criteria.substanceHint).toBeTruthy();
    expect(messages.report.criteria.deliveryHint).toBeTruthy();
  });
});

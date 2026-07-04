import { describe, expect, it } from 'vitest';
import { ReportAnalysisDto } from './report';

const criteria = {
  structure: 82,
  specificity: 74,
  relevance: 91,
  confidence: 79,
  riskPhrases: 88,
  brevity: 84,
};

function createReportAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    overallScore: 82,
    verdict: 'Хорошая база, нужно усилить конкретику.',
    summary: 'Ответ релевантный, но не хватает цифр и результата.',
    criteria,
    recommendations: {
      topFixes: ['Добавить измеримый результат'],
    },
    questionAnalysis: [
      {
        turnId: 'turn_1',
        question: 'Как вы ищете новых B2B-клиентов?',
        answer: 'Через холодные письма и партнёрские рекомендации.',
        whatWorked: 'Есть конкретные каналы.',
        whatWeak: 'Нет масштаба и результата.',
        strongerAnswerStar: 'Добавить ситуацию, действие и результат.',
        nextPractice: 'Проговорить ответ за 90 секунд.',
      },
    ],
    ...overrides,
  };
}

describe('report DTO', () => {
  it('keeps per-question criteria and turn kind in report analysis', () => {
    const parsed = ReportAnalysisDto.parse(
      createReportAnalysis({
        questionAnalysis: [
          {
            turnId: 'turn_2',
            kind: 'clarification',
            question: 'Какой результат дали эти письма?',
            answer: 'Конверсия в демо выросла до 18%.',
            criteria,
            whatWorked: 'Есть измеримый результат.',
            whatWeak: 'Можно добавить период измерения.',
            strongerAnswerStar: 'Указать срок и базовую конверсию.',
            nextPractice: 'Подготовить одну цифру по каждому примеру.',
          },
        ],
      })
    );

    expect(parsed.questionAnalysis[0]).toMatchObject({
      kind: 'clarification',
      criteria,
    });
  });

  it('keeps old reports compatible when per-question criteria are missing', () => {
    const parsed = ReportAnalysisDto.parse(createReportAnalysis());

    expect(parsed.questionAnalysis[0]).toMatchObject({
      kind: 'main',
      criteria: null,
    });
  });
});

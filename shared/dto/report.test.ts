import { describe, expect, it } from 'vitest';
import { InterviewReportDto, ReportAnalysisDto } from './report';

const criteria = {
  substance: 82,
  structure: 74,
  delivery: 79,
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

  it('drops legacy criteria (old key set) to null instead of failing to read', () => {
    const parsed = InterviewReportDto.parse({
      id: 'r1',
      sessionId: 's1',
      trainingMode: 'interviewer',
      status: 'done',
      overallScore: 70,
      verdict: 'ok',
      summary: 'summary',
      // Прежний набор из шести критериев — не должен ронять чтение отчёта.
      criteria: {
        structure: 80,
        specificity: 70,
        relevance: 90,
        confidence: 78,
        riskPhrases: 84,
        brevity: 88,
      },
      recommendations: { topFixes: ['fix'] },
      questionAnalysis: [
        {
          turnId: 't1',
          kind: 'main',
          question: 'q',
          answer: 'a',
          criteria: { structure: 80, specificity: 70, relevance: 90 },
          whatWorked: 'w',
          whatWeak: 'ww',
          strongerAnswerStar: 'star',
          nextPractice: 'np',
        },
      ],
      errorMessage: null,
      model: 'm',
      createdAt: '2026-07-05T00:00:00.000Z',
      updatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(parsed.criteria).toBeNull();
    expect(parsed.trainingMode).toBe('interviewer');
    expect(parsed.questionAnalysis?.[0]?.criteria).toBeNull();
  });

  it('defaults old reports to candidate training mode', () => {
    const parsed = InterviewReportDto.parse({
      id: 'r2',
      sessionId: 's2',
      status: 'queued',
      overallScore: null,
      verdict: null,
      summary: null,
      criteria: null,
      recommendations: null,
      questionAnalysis: null,
      errorMessage: null,
      model: null,
      createdAt: '2026-07-05T00:00:00.000Z',
      updatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(parsed.trainingMode).toBe('candidate');
  });
});

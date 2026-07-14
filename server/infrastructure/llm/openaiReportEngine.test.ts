import { describe, expect, it } from 'vitest';
import {
  REPORT_JSON_SCHEMA,
  attachQuestionsToAnalysis,
  buildInstruction,
  buildReportTranscript,
  extractReportJson,
} from './openaiReportEngine';
import { ReportAnalysisDto, ReportCriteriaDto } from '@/shared/dto';

describe('openai report engine helpers', () => {
  it('extracts report json from all Responses API content blocks', () => {
    const parsed = extractReportJson({
      output: [
        { content: [{ type: 'reasoning', text: 'internal' }] },
        { content: [{ type: 'output_text', text: '{"overallScore":75,' }] },
        { content: [{ type: 'output_text', text: '"verdict":"Нормально"}' }] },
      ],
    });

    expect(parsed).toEqual({
      overallScore: 75,
      verdict: 'Нормально',
    });
  });

  it('forbids invented facts without bracket placeholders or ellipsis', () => {
    const instruction = buildInstruction();

    expect(instruction).toContain('Не выдумывай факты');
    expect(instruction).toContain('Сильных элементов в ответе не выявлено.');
    expect(instruction).toContain('без многоточий');
    expect(instruction).not.toContain('...');
    expect(instruction).not.toContain('…');
    expect(instruction).not.toMatch(/\[[^\]]+\]/);
    expect(instruction).toContain('не должен создавать ложное впечатление');
  });

  it('requires a full scored structure for every main and clarification question', () => {
    const instruction = buildInstruction();

    expect(instruction).toContain('каждого основного и уточняющего вопроса');
    expect(instruction).toContain('"main"');
    expect(instruction).toContain('"clarification"');
    expect(instruction).toContain('recommendations.topFixes');
  });

  it('switches report criteria to interviewer skills for interviewer training', () => {
    const instruction = buildInstruction('interviewer');

    expect(instruction).toContain('пользователь проводил интервью');
    expect(instruction).toContain('структуру интервью');
    expect(instruction).toContain('уточняющие вопросы');
    expect(instruction).toContain('решение по кандидату');
    expect(instruction).toContain('противоречия');
    expect(instruction).toContain('candidate experience');
    expect(instruction).not.toContain('modelAnswer — сильный возможный вариант ответа');
  });

  it('labels interviewer-training history as stages and interviewer speech', () => {
    const transcript = buildReportTranscript(
      [
        {
          id: 'turn_1',
          index: 1,
          kind: 'main',
          question: 'Начните интервью.',
          answerTranscript: 'Расскажите о вашем последнем проекте.',
          followUpForTurnId: null,
        },
      ],
      'interviewer'
    );

    expect(transcript).toContain('Этап 1 (основной): Начните интервью.');
    expect(transcript).toContain(
      'Реплики пользователя-интервьюера: Расскажите о вашем последнем проекте.'
    );
    expect(transcript).not.toContain('Ответ кандидата:');
  });

  it('includes the full interviewer and AI-candidate dialogue in interviewer reports', () => {
    const transcript = buildReportTranscript(
      [
        {
          id: 'turn_dialogue',
          index: 1,
          kind: 'main',
          question: 'Опыт и зона ответственности',
          answerTranscript: 'Какой вклад вы внесли лично?',
          followUpForTurnId: null,
          metadata: {
            dialogue: [
              { role: 'user', content: 'Расскажите о проекте.' },
              { role: 'interviewer', content: 'Мы полностью его переделали.' },
              { role: 'user', content: 'Что именно сделали вы?' },
              { role: 'interviewer', content: 'Я спроектировал состояние.' },
            ],
          },
        },
      ] as never,
      'interviewer'
    );

    expect(transcript).toContain('Пользователь-интервьюер: Расскажите о проекте.');
    expect(transcript).toContain('AI-кандидат: Мы полностью его переделали.');
    expect(transcript).toContain('Пользователь-интервьюер: Что именно сделали вы?');
  });

  it('keeps the structured-output schema in sync with the Zod DTO criteria', () => {
    const schemaCriteriaKeys = Object.keys(
      REPORT_JSON_SCHEMA.properties.criteria.properties
    ).sort();
    const dtoCriteriaKeys = Object.keys(ReportCriteriaDto.shape).sort();
    expect(schemaCriteriaKeys).toEqual(dtoCriteriaKeys);

    // Поля, которые модель обязана вернуть, — подмножество полей DTO
    // (question/answer подставляет сервер).
    const schemaItemKeys =
      REPORT_JSON_SCHEMA.properties.questionAnalysis.items.required;
    expect(schemaItemKeys).not.toContain('question');
    expect(schemaItemKeys).not.toContain('answer');
  });

  it('attaches question and answer texts from turns so the DTO validates', () => {
    const criteria = {
      substance: 10,
      structure: 10,
      delivery: 10,
    };
    const parsed = {
      overallScore: 40,
      verdict: 'Есть над чем работать',
      summary: 'Краткое резюме интервью.',
      criteria,
      recommendations: { topFixes: ['Отвечать на все вопросы'] },
      questionAnalysis: [
        {
          turnId: 'turn_1',
          kind: 'main',
          criteria,
          whatWorked: 'Сильных элементов в ответе не выявлено.',
          whatWeak: 'Ответ отсутствует',
          modelAnswer: 'Пример сильного ответа.',
          strongerAnswerStar: 'Ситуация, задача, действия, результат.',
          nextPractice: 'Потренировать ответ вслух.',
        },
      ],
    };
    const turns = [
      {
        id: 'turn_1',
        question: 'Расскажите о себе.',
        answerTranscript: 'Мой ответ.',
      },
    ] as never;

    const attached = attachQuestionsToAnalysis(parsed, turns);
    const analysis = attached.questionAnalysis as Array<Record<string, unknown>>;
    expect(analysis[0]).toMatchObject({
      question: 'Расскажите о себе.',
      answer: 'Мой ответ.',
    });
    expect(() =>
      ReportAnalysisDto.parse({ ...attached, model: 'test-model' })
    ).not.toThrow();
  });

  it('attaches the complete conversation fragment to interviewer analysis', () => {
    const attached = attachQuestionsToAnalysis(
      {
        questionAnalysis: [{ turnId: 'turn_1' }],
      },
      [
        {
          id: 'turn_1',
          question: 'Техническая глубина',
          answerTranscript: 'Что именно сделали вы?',
          metadata: {
            dialogue: [
              { role: 'user', content: 'Расскажите об архитектуре.' },
              { role: 'interviewer', content: 'Мы использовали микрофронтенды.' },
            ],
          },
        },
      ] as never,
      'interviewer'
    );

    expect(attached.questionAnalysis).toEqual([
      expect.objectContaining({
        question: 'Техническая глубина',
        answer:
          'Вы: Расскажите об архитектуре.\nAI-кандидат: Мы использовали микрофронтенды.',
      }),
    ]);
  });
});

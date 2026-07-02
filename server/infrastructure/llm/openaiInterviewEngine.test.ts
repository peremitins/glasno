import { describe, expect, it } from 'vitest';
import {
  extractResponsesText,
  normalizeSampleAnswerHint,
  normalizeQuestionHintDetails,
  parseJsonObject,
} from './openaiInterviewEngine';

describe('openai interview engine helpers', () => {
  it('extracts text from every Responses API output content block', () => {
    const text = extractResponsesText({
      output: [
        {
          content: [{ type: 'reasoning', text: 'ignore this' }],
        },
        {
          content: [{ type: 'output_text', text: '{"question":"' }],
        },
        {
          content: [{ type: 'output_text', text: 'Расскажите о KPI"}' }],
        },
      ],
    });

    expect(text).toBe('{"question":"Расскажите о KPI"}');
  });

  it('parses strict json even when the model wraps it in a json fence', () => {
    expect(parseJsonObject('```json\n{"needsClarification":false}\n```')).toEqual({
      needsClarification: false,
    });
  });

  it('normalizes detailed question hints from model json', () => {
    expect(
      normalizeQuestionHintDetails({
        focus: '  Проверяет знание TypeScript.  ',
        answerPlan: [
          'Определить TypeScript.',
          'Связать типы с ранним поиском ошибок.',
          'Показать пользу для рефакторинга.',
          'Назвать влияние на командную разработку.',
          'Лишний пункт будет отброшен.',
        ],
        keyDefinitions: [
          'TypeScript — типизированное расширение JavaScript.',
          '',
          'Runtime — выполнение кода в браузере или Node.js.',
          'Очень длинное определение '.repeat(30),
        ],
        sampleAnswer: '  Я бы начал с влияния типизации на качество кода.  ',
      })
    ).toEqual({
      focus: 'Проверяет знание TypeScript.',
      answerPlan: [
        'Определить TypeScript.',
        'Связать типы с ранним поиском ошибок.',
        'Показать пользу для рефакторинга.',
        'Назвать влияние на командную разработку.',
      ],
      keyDefinitions: [
        'TypeScript — типизированное расширение JavaScript.',
        'Runtime — выполнение кода в браузере или Node.js.',
        expect.stringMatching(/^Очень длинное определение/),
      ],
      sampleAnswer: 'Я бы начал с влияния типизации на качество кода.',
    });
  });

  it('normalizes sample answer hint json for follow-up questions', () => {
    expect(
      normalizeSampleAnswerHint({
        sampleAnswer: '  Я бы связал TypeScript со скоростью онбординга.  ',
      })
    ).toEqual({
      sampleAnswer: 'Я бы связал TypeScript со скоростью онбординга.',
    });
  });
});

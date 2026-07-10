import { describe, expect, it } from 'vitest';
import {
  buildConverseInstruction,
  buildConverseUserText,
  extractResponsesText,
  normalizeSampleAnswerHint,
  normalizeQuestionHintDetails,
  parseJsonObject,
} from './openaiInterviewEngine';
import type { ConverseParams } from '@/server/interface/interviewEngine';

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

  it('does not append ellipsis when a generated sample answer is too long', () => {
    const normalized = normalizeSampleAnswerHint({
      sampleAnswer:
        'Я бы начал с конкретного случая: на проекте заметил деградацию производительности после внедрения нового списка. ' +
        'Сначала проверил Web Vitals и профилировщик, затем нашёл лишние перерендеры и вынес тяжёлые вычисления. ' +
        'После релиза сравнил метрики до и после, подтвердил улучшение и описал результат команде. ' +
        'Дополнительная техническая деталь '.repeat(40),
    });

    expect(normalized.sampleAnswer.length).toBeLessThanOrEqual(700);
    expect(normalized.sampleAnswer).not.toMatch(/…$/);
    expect(normalized.sampleAnswer).toMatch(/[.!?]$/);
  });

  it('switches live dialogue instructions to AI candidate mode for interviewer training', () => {
    const instruction = buildConverseInstruction({
      trainingMode: 'interviewer',
      interviewerMode: 'neutral',
      metadata: {},
    });

    expect(instruction).toContain('Ты — AI-кандидат Гласно');
    expect(instruction).toContain('Пользователь проводит интервью');
    expect(instruction).toContain('отвечай как кандидат');
    expect(instruction).not.toContain('отвечать ВМЕСТО кандидата');
  });

  it('adds previous main questions without answers to live dialogue context', () => {
    const session: ConverseParams['session'] = {
      id: 'session_1',
      anonymousSessionId: 'anon_1',
      userId: null,
      trainingMode: 'candidate',
      source: 'profession',
      role: 'Product Manager',
      level: 'senior',
      questionCount: 3,
      language: 'ru',
      interviewerMode: 'neutral',
      interviewerAvatarId: 'neutral-pro',
      status: 'running',
      companyName: 'Acme',
      vacancyTitle: 'Senior PM',
      vacancyRaw: null,
      vacancyUrl: null,
      resumeRaw: null,
      metadata: {},
      createdAt: new Date('2026-07-09T10:00:00.000Z'),
    };
    const currentTurn: ConverseParams['turn'] = {
      id: 'turn_3',
      sessionId: 'session_1',
      index: 3,
      kind: 'main',
      question: 'Как вы запускали сложный продукт?',
      answerTranscript: null,
      followUpForTurnId: null,
      metadata: null,
      answeredAt: null,
      createdAt: new Date('2026-07-09T10:03:00.000Z'),
    };
    const turns: ConverseParams['turns'] = [
      {
        id: 'turn_1',
        sessionId: 'session_1',
        index: 1,
        kind: 'main',
        question: 'Почему вы хотите эту роль?',
        answerTranscript: 'Ответ не должен уходить в этот блок.',
        followUpForTurnId: null,
        metadata: null,
        answeredAt: new Date('2026-07-09T10:01:00.000Z'),
        createdAt: new Date('2026-07-09T10:01:00.000Z'),
      },
      {
        id: 'turn_2',
        sessionId: 'session_1',
        index: 2,
        kind: 'clarification',
        question: 'Какой именно продукт?',
        answerTranscript: 'Уточнение тоже не нужно.',
        followUpForTurnId: 'turn_1',
        metadata: null,
        answeredAt: new Date('2026-07-09T10:02:00.000Z'),
        createdAt: new Date('2026-07-09T10:02:00.000Z'),
      },
      currentTurn,
    ];

    const text = buildConverseUserText({
      session,
      turn: currentTurn,
      turns,
      dialogue: [
        {
          role: 'user',
          content: 'Я отвечал за go-to-market.',
        },
      ],
      exchanges: 1,
    });

    expect(text).toContain('Предыдущие основные вопросы');
    expect(text).toContain('1. Почему вы хотите эту роль?');
    expect(text).not.toContain('Ответ не должен');
    expect(text).not.toContain('Какой именно продукт?');
    expect(text).toContain('Текущий вопрос: Как вы запускали сложный продукт?');
    expect(text).toContain('Кандидат: Я отвечал за go-to-market.');
  });
});

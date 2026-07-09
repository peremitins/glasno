import { describe, expect, it } from 'vitest';
import {
  buildInterviewModeBridgeContext,
  buildRealtimeResponseCreateEvent,
} from './interviewModeBridgeContext';
import type { InterviewStateResponse } from '@/shared/dto';

describe('interview mode bridge context', () => {
  it('summarizes previous main questions and keeps the current turn dialogue', () => {
    const state = {
      session: {
        role: 'Product Manager',
        level: 'senior',
        companyName: 'Acme',
        vacancyTitle: 'Senior PM',
      },
      currentTurn: {
        id: 'turn_5',
        index: 5,
        question: 'Как вы запускали сложный продукт?',
        messages: [
          {
            role: 'interviewer',
            content: 'Расскажите про запуск сложного продукта.',
            at: '2026-07-09T10:00:00.000Z',
          },
          {
            role: 'user',
            content: 'Я запускал B2B-модуль и отвечал за go-to-market.',
            at: '2026-07-09T10:01:00.000Z',
          },
        ],
      },
      turns: [
        {
          id: 'turn_1',
          index: 1,
          kind: 'main',
          question: 'Почему вы хотите эту роль?',
        },
        {
          id: 'turn_2',
          index: 2,
          kind: 'main',
          question: 'Как вы работаете с метриками?',
          answerTranscript: 'Не должно попадать в список прошлых вопросов.',
        },
        {
          id: 'turn_3',
          index: 2,
          kind: 'clarification',
          question: 'Какую метрику вы выбрали?',
        },
        {
          id: 'turn_5',
          index: 5,
          kind: 'main',
          question: 'Как вы запускали сложный продукт?',
        },
      ],
    } as InterviewStateResponse;

    const context = buildInterviewModeBridgeContext(state);

    expect(context).toContain('Предыдущие основные вопросы');
    expect(context).toContain('1. Почему вы хотите эту роль?');
    expect(context).toContain('2. Как вы работаете с метриками?');
    expect(context).not.toContain('Не должно попадать');
    expect(context).not.toContain('Какую метрику вы выбрали?');
    expect(context).toContain('Текущий вопрос: Как вы запускали сложный продукт?');
    expect(context).toContain(
      'Интервьюер: Расскажите про запуск сложного продукта.'
    );
    expect(context).toContain(
      'Кандидат: Я запускал B2B-модуль и отвечал за go-to-market.'
    );
  });

  it('embeds bridge context into realtime response.create instructions', () => {
    const state = {
      session: {
        role: 'Product Manager',
        level: 'senior',
        companyName: 'Acme',
        vacancyTitle: 'Senior PM',
      },
      currentTurn: {
        id: 'turn_2',
        index: 2,
        question: 'Как вы запускали сложный продукт?',
        messages: [
          {
            role: 'user',
            content: 'В тексте я рассказал про B2B-модуль.',
            at: '2026-07-09T10:01:00.000Z',
          },
        ],
      },
      turns: [
        {
          id: 'turn_1',
          index: 1,
          kind: 'main',
          question: 'Почему вы хотите эту роль?',
        },
        {
          id: 'turn_2',
          index: 2,
          kind: 'main',
          question: 'Как вы запускали сложный продукт?',
        },
      ],
    } as InterviewStateResponse;

    const event = buildRealtimeResponseCreateEvent({
      state,
      instructions: 'Ответь кратко.',
      metadata: { glasno_kind: 'question_announcement' },
    });

    expect(event).toMatchObject({
      type: 'response.create',
      response: {
        metadata: { glasno_kind: 'question_announcement' },
      },
    });
    const instructions = (event.response as { instructions: string })
      .instructions;
    expect(instructions).toContain('Ответь кратко.');
    expect(instructions).toContain('Предыдущие основные вопросы');
    expect(instructions).toContain('Почему вы хотите эту роль?');
    expect(instructions).toContain('В тексте я рассказал про B2B-модуль.');
  });
});

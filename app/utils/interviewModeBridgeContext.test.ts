import { describe, expect, it } from 'vitest';
import {
  buildInterviewModeBridgeContext,
  buildRealtimeQuestionAnnouncement,
  buildRealtimeResponseCreateEvent,
  buildRealtimeTimeboxReminderInstruction,
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

  it('reminds the AI interviewer about follow-ups it already asked', () => {
    const state = {
      session: {
        role: 'Frontend-разработчик',
        level: 'middle',
        companyName: null,
        vacancyTitle: null,
      },
      currentTurn: {
        id: 'turn_1',
        index: 1,
        question: 'Какие возможности TypeScript вы используете в Vue?',
        messages: [
          {
            role: 'interviewer',
            content: 'Какие возможности TypeScript вы используете в Vue?',
            at: '2026-07-18T10:00:00.000Z',
          },
          {
            role: 'user',
            content: 'Строгие типы и generics.',
            at: '2026-07-18T10:01:00.000Z',
          },
          {
            role: 'interviewer',
            content: 'Понимаю. Как вы типизируете props компонентов?',
            at: '2026-07-18T10:02:00.000Z',
          },
        ],
      },
      turns: [
        {
          id: 'turn_1',
          index: 1,
          kind: 'main',
          question: 'Какие возможности TypeScript вы используете в Vue?',
        },
      ],
    } as InterviewStateResponse;

    const context = buildInterviewModeBridgeContext(state);

    expect(context).toContain('Уточняющие вопросы, которые ты УЖЕ задал');
    expect(context).toContain('1. Как вы типизируете props компонентов?');
    // Основной вопрос не считается уточнением и в список не попадает.
    expect(context).not.toContain('2. Какие возможности TypeScript');
    expect(context).toContain(
      'Не повторяй их и не задавай их переформулировки'
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

  it('uses AI-candidate labels and never asks it to conduct the interview', () => {
    const state = {
      session: {
        trainingMode: 'interviewer',
        role: 'Frontend-разработчик',
        level: 'middle',
        companyName: null,
        vacancyTitle: null,
      },
      currentTurn: {
        id: 'turn_1',
        index: 1,
        question: 'Начните знакомство с кандидатом.',
        messages: [
          {
            role: 'user',
            content: 'Расскажите немного о себе.',
            at: '2026-07-13T10:00:00.000Z',
          },
          {
            role: 'interviewer',
            content: 'Я frontend-разработчик с четырьмя годами опыта.',
            at: '2026-07-13T10:00:05.000Z',
          },
        ],
      },
      turns: [
        {
          id: 'turn_1',
          index: 1,
          kind: 'main',
          question: 'Начните знакомство с кандидатом.',
        },
      ],
    } as InterviewStateResponse;

    const context = buildInterviewModeBridgeContext(state);

    // Интервью непрерывное: этапов и «текущего этапа» у интервьюера нет.
    expect(context).toContain('Идёт непрерывное интервью');
    expect(context).not.toContain('Текущий этап');
    expect(context).not.toContain('Предыдущие основные этапы');
    expect(context).toContain('Интервьюер: Расскажите немного о себе.');
    expect(context).toContain(
      'AI-кандидат: Я frontend-разработчик с четырьмя годами опыта.'
    );
    expect(context).toContain('Продолжай только как AI-кандидат');
    expect(context).not.toContain('Продолжай обсуждать только текущий вопрос');
    // AI-кандидат не задаёт уточнений — списка уже заданных вопросов быть не должно.
    expect(context).not.toContain('УЖЕ задал');
  });

  it('does not send interviewer timebox commands to the AI-candidate', () => {
    expect(buildRealtimeTimeboxReminderInstruction('candidate')).toContain(
      'предложением перейти к следующему вопросу'
    );
    expect(buildRealtimeTimeboxReminderInstruction('interviewer')).toBe('');
  });

  it('builds role-safe realtime announcements for both training modes', () => {
    const interviewer = buildRealtimeQuestionAnnouncement({
      trainingMode: 'candidate',
      question: 'Как вы оптимизируете загрузку?',
      firstQuestion: true,
      freshInterviewStart: true,
    });
    expect(interviewer.announcementInstructions).toContain(
      'задай первый вопрос интервью дословно'
    );

    const candidate = buildRealtimeQuestionAnnouncement({
      trainingMode: 'interviewer',
      question: 'Расскажите о последнем проекте.',
      firstQuestion: true,
      freshInterviewStart: true,
    });
    expect(candidate.contextText).toContain('AI-кандидат');
    expect(candidate.announcementInstructions).toContain('как кандидат');
    expect(candidate.announcementInstructions).toMatch(
      /не задавай пользователю вопросов/i
    );
    expect(candidate.announcementInstructions).not.toContain(
      'задай первый вопрос'
    );
    expect(candidate.announcementInstructions).not.toContain(
      'озвучь кандидату'
    );
  });
});

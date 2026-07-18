import { describe, expect, it } from 'vitest';
import {
  buildAskedQuestionsReminder,
  collectAskedInterviewerQuestions,
} from './interviewAskedQuestions';

describe('collectAskedInterviewerQuestions', () => {
  it('collects only interviewer question sentences from the dialogue', () => {
    const questions = collectAskedInterviewerQuestions([
      {
        role: 'interviewer',
        content:
          'Понимаю. Какие типы утилит TypeScript вы используете? Приведите пример.',
      },
      { role: 'user', content: 'Использую Pick и Omit. А что дальше?' },
      { role: 'interviewer', content: 'Как вы типизируете props компонентов?' },
    ]);

    expect(questions).toEqual([
      'Какие типы утилит TypeScript вы используете?',
      'Как вы типизируете props компонентов?',
    ]);
  });

  it('deduplicates repeated questions ignoring case and punctuation', () => {
    const questions = collectAskedInterviewerQuestions([
      { role: 'interviewer', content: 'Как вы проверяете типы в шаблонах?' },
      { role: 'interviewer', content: 'Как вы проверяете типы в шаблонах?!' },
      { role: 'interviewer', content: 'как ВЫ проверяете типы в шаблонах?' },
    ]);

    expect(questions).toEqual(['Как вы проверяете типы в шаблонах?']);
  });

  it('skips move-on prompts and the current main question', () => {
    const questions = collectAskedInterviewerQuestions(
      [
        {
          role: 'interviewer',
          content: 'Какие возможности TypeScript вы используете в Vue?',
        },
        { role: 'interviewer', content: 'Готовы перейти к следующему вопросу?' },
        { role: 'interviewer', content: 'Что скажете про generics?' },
      ],
      'Какие возможности TypeScript вы используете в Vue?'
    );

    expect(questions).toEqual(['Что скажете про generics?']);
  });

  it('keeps only the most recent questions when there are too many', () => {
    const dialogue = Array.from({ length: 12 }, (_, index) => ({
      role: 'interviewer' as const,
      content: `Уточнение номер ${index + 1}?`,
    }));

    const questions = collectAskedInterviewerQuestions(dialogue);

    expect(questions).toHaveLength(8);
    expect(questions[0]).toBe('Уточнение номер 5?');
    expect(questions[7]).toBe('Уточнение номер 12?');
  });
});

describe('buildAskedQuestionsReminder', () => {
  it('returns an empty string when no follow-ups were asked yet', () => {
    expect(
      buildAskedQuestionsReminder([
        { role: 'user', content: 'Мой ответ без вопросов от интервьюера.' },
      ])
    ).toBe('');
  });

  it('builds a numbered reminder block with an anti-repeat instruction', () => {
    const reminder = buildAskedQuestionsReminder([
      { role: 'interviewer', content: 'Как вы используете generics?' },
      { role: 'user', content: 'Рассказал про generics.' },
      { role: 'interviewer', content: 'А как насчёт строгих режимов tsc?' },
    ]);

    expect(reminder).toContain('УЖЕ задал по текущему вопросу');
    expect(reminder).toContain('1. Как вы используете generics?');
    expect(reminder).toContain('2. А как насчёт строгих режимов tsc?');
    expect(reminder).toContain('Не повторяй их и не задавай их переформулировки');
  });
});

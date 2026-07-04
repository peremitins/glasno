import { describe, expect, it } from 'vitest';
import {
  ExplainLearningTermRequestDto,
  ExtractLearningTermsRequestDto,
  LearningTermContextDto,
} from './learningTerms';

describe('learning terms DTO', () => {
  it('accepts a bounded batch of text snippets with context', () => {
    const parsed = ExtractLearningTermsRequestDto.parse({
      items: [
        {
          id: 'question-current',
          text: 'Расскажите, что такое область видимости в JavaScript.',
          context: {
            kind: 'interview_question',
            interviewSessionId: 'session_1',
            turnId: 'turn_1',
            label: 'Текущий вопрос',
          },
        },
      ],
    });

    expect(parsed.items[0]?.context.kind).toBe('interview_question');
    expect(parsed.items[0]?.text).toContain('область видимости');
  });

  it('limits extraction batches to eight snippets', () => {
    expect(() =>
      ExtractLearningTermsRequestDto.parse({
        items: Array.from({ length: 9 }, (_, index) => ({
          id: `item_${index}`,
          text: `Текст с термином ${index}`,
          context: { kind: 'generic' },
        })),
      })
    ).toThrow();
  });

  it('validates explain requests for a concrete highlighted term', () => {
    const parsed = ExplainLearningTermRequestDto.parse({
      term: 'CORS',
      text: 'Важно объяснить политики CORS без лишних деталей.',
      shortDefinition: 'CORS — правила доступа браузера к ресурсам другого домена.',
      context: { kind: 'interview_hint', interviewSessionId: 'session_1' },
    });

    expect(parsed.term).toBe('CORS');
    expect(parsed.context.kind).toBe('interview_hint');
  });

  it('accepts all supported context kinds', () => {
    expect(() =>
      LearningTermContextDto.parse({ kind: 'question_bank', label: 'База вопросов' })
    ).not.toThrow();
  });
});

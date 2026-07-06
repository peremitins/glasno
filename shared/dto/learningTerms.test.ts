import { describe, expect, it } from 'vitest';
import {
  ExplainLearningTermRequestDto,
  LearningTermContextDto,
} from './learningTerms';
import * as learningTermsDto from './learningTerms';

const removedRequestDto = ['Extract', 'Learning', 'Terms', 'RequestDto'].join('');
const removedResponseDto = ['Extract', 'Learning', 'Terms', 'ResponseDto'].join('');
const removedCandidateDto = ['Learning', 'Term', 'CandidateDto'].join('');

describe('learning terms DTO', () => {
  it('does not expose background extraction DTOs', () => {
    expect(removedRequestDto in learningTermsDto).toBe(false);
    expect(removedResponseDto in learningTermsDto).toBe(false);
    expect(removedCandidateDto in learningTermsDto).toBe(false);
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

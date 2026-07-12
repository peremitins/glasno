import { describe, expect, it } from 'vitest';
import {
  QuestionPreferenceStatusDto,
  QuestionSemanticPassportDto,
  SetTurnQuestionPreferenceRequestDto,
} from './questionPreferences';

describe('question preference DTO', () => {
  it('accepts only the three approved preference statuses', () => {
    expect(QuestionPreferenceStatusDto.options).toEqual([
      'repeat',
      'mastered',
      'hidden',
    ]);
    expect(() => QuestionPreferenceStatusDto.parse('default')).toThrow();
  });

  it('normalizes a compact semantic passport', () => {
    const parsed = QuestionSemanticPassportDto.parse({
      conceptKey: ' Browser_Rendering ',
      conceptLabel: ' Построение DOM и CSSOM ',
      topicTags: [' DOM ', 'cssom', 'dom'],
      requiredContextTags: [' Vue ', 'vue'],
      focus: 'professional',
    });

    expect(parsed).toEqual({
      conceptKey: 'browser_rendering',
      conceptLabel: 'Построение DOM и CSSOM',
      topicTags: ['dom', 'cssom'],
      requiredContextTags: ['vue'],
      focus: 'professional',
    });
  });

  it('validates setting a preference for an interview turn', () => {
    expect(
      SetTurnQuestionPreferenceRequestDto.parse({
        turnId: 'turn_1',
        status: 'repeat',
      })
    ).toEqual({ turnId: 'turn_1', status: 'repeat' });
  });
});

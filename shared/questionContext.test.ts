import { describe, expect, it } from 'vitest';
import {
  buildQuestionContext,
  matchesQuestionContext,
} from './questionContext';

describe('question context', () => {
  it('maps frontend aliases to the same canonical role', () => {
    expect(buildQuestionContext({ role: 'Frontend-разработчик', level: 'middle' }))
      .toMatchObject({ roleKey: 'it-frontend', level: 'middle' });
    expect(buildQuestionContext({ role: 'фронтенд developer', level: 'middle' }))
      .toMatchObject({ roleKey: 'it-frontend', level: 'middle' });
  });

  it('does not mix frontend with backend or different levels', () => {
    const preference = {
      roleKey: 'it-frontend',
      level: 'middle' as const,
      contextTags: ['vue'],
      focus: 'professional' as const,
    };

    expect(
      matchesQuestionContext(preference, {
        roleKey: 'it-backend',
        level: 'middle',
        contextTags: ['node.js'],
        focus: 'professional',
      })
    ).toBe(false);
    expect(
      matchesQuestionContext(preference, {
        roleKey: 'it-frontend',
        level: 'senior',
        contextTags: ['vue'],
        focus: 'professional',
      })
    ).toBe(false);
  });

  it('requires technology tags only for technology-specific questions', () => {
    const vueQuestion = {
      roleKey: 'it-frontend',
      level: 'middle' as const,
      contextTags: ['vue'],
      focus: 'professional' as const,
    };
    const generalBrowserQuestion = { ...vueQuestion, contextTags: [] };
    const reactInterview = {
      roleKey: 'it-frontend',
      level: 'middle' as const,
      contextTags: ['react'],
      focus: 'professional' as const,
    };

    expect(matchesQuestionContext(vueQuestion, reactInterview)).toBe(false);
    expect(matchesQuestionContext(generalBrowserQuestion, reactInterview)).toBe(true);
  });
});

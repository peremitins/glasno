import { describe, expect, it } from 'vitest';
import { selectCanonicalQuestions } from './canonicalQuestionSelection';

const base = {
  roleKey: 'it-frontend',
  roleLabel: 'Frontend-разработчик',
  seniority: 'middle' as const,
  interviewType: 'technical' as const,
  topic: 'javascript',
  subtopic: null,
  tags: ['javascript'],
  expectedConcepts: ['основы javascript'],
};

describe('canonical question selection', () => {
  it('keeps exact level and compatible stack without sending the bank to an LLM', () => {
    const selected = selectCanonicalQuestions({
      candidates: [
        { ...base, id: 'none', corpusId: 'none', framework: 'none' as const, question: 'Общий вопрос' },
        { ...base, id: 'vue', corpusId: 'vue', framework: 'vue' as const, question: 'Вопрос по Vue' },
        { ...base, id: 'angular', corpusId: 'angular', framework: 'angular' as const, question: 'Вопрос по Angular' },
        { ...base, id: 'senior', corpusId: 'senior', framework: 'vue' as const, seniority: 'senior' as const, question: 'Сложный вопрос' },
      ],
      context: {
        roleKey: 'it-frontend',
        level: 'middle',
        contextTags: ['vue', 'typescript'],
        focus: 'professional',
        sourceText: 'Vue TypeScript composition API',
      },
      preferences: [],
      count: 4,
    });

    expect(selected.map((item) => item.corpusId)).toEqual(['vue', 'none']);
  });

  it('excludes hidden and mastered concepts while repeat is handled separately', () => {
    const candidates = ['repeat', 'mastered', 'hidden', 'fresh'].map((id) => ({
      ...base,
      id,
      corpusId: id,
      framework: 'none' as const,
      question: id,
    }));
    const selected = selectCanonicalQuestions({
      candidates,
      context: {
        roleKey: 'it-frontend',
        level: 'middle',
        contextTags: [],
        focus: 'professional',
        sourceText: '',
      },
      preferences: ['repeat', 'mastered', 'hidden'].map((conceptKey, index) => ({
        conceptKey,
        status: (['repeat', 'mastered', 'hidden'] as const)[index]!,
      })),
      count: 4,
    });

    expect(selected.map((item) => item.corpusId)).toEqual(['fresh']);
  });

  it('uses unselected compatible questions before starting a new cycle', () => {
    const candidates = ['first', 'second', 'third'].map((id) => ({
      ...base,
      id,
      corpusId: id,
      framework: 'none' as const,
      question: `Вопрос ${id}`,
    }));

    const selected = selectCanonicalQuestions({
      candidates,
      context: {
        roleKey: 'it-frontend',
        level: 'middle',
        contextTags: [],
        focus: 'professional',
        sourceText: '',
      },
      preferences: [],
      previouslySelectedCanonicalQuestionIds: ['first', 'second'],
      count: 2,
    });

    expect(selected.map((item) => item.id)).toEqual(['third', 'first']);
  });

  it('recognizes questions selected by the corpus id stored in older plans', () => {
    const candidates = ['first', 'second', 'third'].map((corpusId) => ({
      ...base,
      id: `database_${corpusId}`,
      corpusId,
      framework: 'none' as const,
      question: `Вопрос ${corpusId}`,
    }));

    const selected = selectCanonicalQuestions({
      candidates,
      context: {
        roleKey: 'it-frontend',
        level: 'middle',
        contextTags: [],
        focus: 'professional',
        sourceText: '',
      },
      preferences: [],
      previouslySelectedCanonicalQuestionIds: ['first', 'second'],
      count: 2,
    });

    expect(selected.map((item) => item.id)).toEqual([
      'database_third',
      'database_first',
    ]);
  });
});

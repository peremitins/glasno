import { describe, expect, it } from 'vitest';
import { mergeDuplicateGroup } from './deduplicate';

function item(id: string, question: string, variants: string[] = []) {
  return {
    id,
    slug: id,
    framework: 'none',
    topic: 'engineering',
    subtopic: null,
    interviewType: 'technical',
    seniority: 'junior',
    difficulty: 2,
    question,
    variants,
    tags: ['testing'],
    expectedConcepts: ['виды тестов'],
    provenance: { changesSummary: null },
  };
}

describe('question bank duplicate merge', () => {
  it('keeps one canonical question and moves useful wording into variants', () => {
    const canonical = item(
      'testing_overview',
      'Чем отличаются unit, integration и E2E-тесты?'
    );
    const duplicate = item(
      'testing_types',
      'Объясните разницу между unit-, integration- и end-to-end тестами.',
      ['Когда нужен каждый тип теста?']
    );

    const merged = mergeDuplicateGroup(canonical, [duplicate]);

    expect(merged.id).toBe('testing_overview');
    expect(merged.variants).toEqual([
      'Объясните разницу между unit-, integration- и end-to-end тестами.',
      'Когда нужен каждый тип теста?',
    ]);
    expect(merged.provenance.changesSummary).toContain('testing_types');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeLearningTermExplanation } from './openaiLearningTermsEngine';

const source = readFileSync(
  'server/infrastructure/llm/openaiLearningTermsEngine.ts',
  'utf8'
);
const removedExtractInstruction = ['build', 'Extract', 'Instruction'].join('');
const removedExtractPurpose = ['learning', 'terms', 'extract'].join('_');
const removedExtractMethod = ['extract', 'Terms('].join('');

describe('openai learning terms engine helpers', () => {
  it('does not implement background term extraction', () => {
    expect(source).not.toContain(['normalize', 'Learning', 'Terms', 'For', 'Text'].join(''));
    expect(source).not.toContain(removedExtractInstruction);
    expect(source).not.toContain(removedExtractPurpose);
    expect(source).not.toContain(removedExtractMethod);
  });

  it('requests minimal reasoning effort so GPT-5 nano returns text within the token budget', () => {
    // Без этого reasoning-модель тратит весь max_output_tokens на размышления
    // и возвращает пустой ответ (status=incomplete) — на проде массовые 502.
    expect(source).toContain("reasoning: { effort: 'minimal' }");
    expect(source).toContain("model.startsWith('gpt-5')");
  });

  it('does not use local semantic allow or deny lists', () => {
    expect(source).not.toContain('HIGH_SIGNAL_RUSSIAN_PATTERNS');
    expect(source).not.toContain('LOW_SIGNAL_RUSSIAN_PATTERNS');
    expect(source).not.toContain('COMMON_TECH_NAME_TOKENS');
    expect(source).not.toContain('LATIN_CONNECTOR_TOKENS');
    expect(source).not.toContain('isHighSignalLearningTerm');
  });

  it('normalizes full explanations with safe fallbacks', () => {
    expect(
      normalizeLearningTermExplanation('CORS', 'Короткое определение', {
        title: '  CORS  ',
        shortDefinition: '',
        explanation: '  CORS ограничивает, какие сайты могут читать ответ API.  ',
      })
    ).toEqual({
      term: 'CORS',
      title: 'CORS',
      shortDefinition: 'Короткое определение',
      explanation: 'CORS ограничивает, какие сайты могут читать ответ API.',
    });
  });
});

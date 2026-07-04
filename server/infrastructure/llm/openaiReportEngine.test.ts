import { describe, expect, it } from 'vitest';
import { buildInstruction, extractReportJson } from './openaiReportEngine';

describe('openai report engine helpers', () => {
  it('extracts report json from all Responses API content blocks', () => {
    const parsed = extractReportJson({
      output: [
        { content: [{ type: 'reasoning', text: 'internal' }] },
        { content: [{ type: 'output_text', text: '{"overallScore":75,' }] },
        { content: [{ type: 'output_text', text: '"verdict":"Нормально"}' }] },
      ],
    });

    expect(parsed).toEqual({
      overallScore: 75,
      verdict: 'Нормально',
    });
  });

  it('forbids invented facts and metrics in model answers', () => {
    const instruction = buildInstruction();

    expect(instruction).toContain('Не выдумывай факты');
    expect(instruction).toContain('[подставьте реальный результат]');
    expect(instruction).toContain('[добавьте метрику]');
    expect(instruction).toContain('не должен создавать ложное впечатление');
  });
});

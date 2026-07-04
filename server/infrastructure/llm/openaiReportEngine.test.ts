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

  it('forbids invented facts without bracket placeholders or ellipsis', () => {
    const instruction = buildInstruction();

    expect(instruction).toContain('Не выдумывай факты');
    expect(instruction).toContain('Сильных элементов в ответе не выявлено.');
    expect(instruction).toContain('без многоточий');
    expect(instruction).not.toContain('...');
    expect(instruction).not.toContain('…');
    expect(instruction).not.toMatch(/\[[^\]]+\]/);
    expect(instruction).toContain('не должен создавать ложное впечатление');
  });

  it('requires a full scored structure for every main and clarification question', () => {
    const instruction = buildInstruction();

    expect(instruction).toContain('каждого основного и уточняющего вопроса');
    expect(instruction).toContain('"kind":"main"');
    expect(instruction).toContain('"kind":"clarification"');
    expect(instruction).toContain('"criteria":{"structure"');
  });
});

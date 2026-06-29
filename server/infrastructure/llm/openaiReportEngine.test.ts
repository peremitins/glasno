import { describe, expect, it } from 'vitest';
import { extractReportJson } from './openaiReportEngine';

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
});

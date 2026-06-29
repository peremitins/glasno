import { describe, expect, it } from 'vitest';
import { extractResponsesText, parseJsonObject } from './openaiInterviewEngine';

describe('openai interview engine helpers', () => {
  it('extracts text from every Responses API output content block', () => {
    const text = extractResponsesText({
      output: [
        {
          content: [{ type: 'reasoning', text: 'ignore this' }],
        },
        {
          content: [{ type: 'output_text', text: '{"question":"' }],
        },
        {
          content: [{ type: 'output_text', text: 'Расскажите о KPI"}' }],
        },
      ],
    });

    expect(text).toBe('{"question":"Расскажите о KPI"}');
  });

  it('parses strict json even when the model wraps it in a json fence', () => {
    expect(parseJsonObject('```json\n{"needsClarification":false}\n```')).toEqual({
      needsClarification: false,
    });
  });
});

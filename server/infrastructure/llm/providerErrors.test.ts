import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = [
  'server/infrastructure/llm/openaiInterviewEngine.ts',
  'server/infrastructure/llm/openaiReportEngine.ts',
  'server/infrastructure/llm/openaiLearningTermsEngine.ts',
  'server/infrastructure/llm/openaiImageTextExtractor.ts',
  'server/api/realtime/session.post.ts',
  'server/api/realtime/session/sdp.post.ts',
  'server/api/tts/openai.post.ts',
  'server/infrastructure/llm/openaiResponsesClient.ts',
];

describe('provider-facing error copy', () => {
  it('does not expose provider brand names in apiError messages', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const apiErrorCalls = source.match(/apiError\([\s\S]*?\)/g) ?? [];
      for (const call of apiErrorCalls) {
        expect(call, file).not.toMatch(/OpenAI|ChatGPT/i);
      }
    }
  });
});

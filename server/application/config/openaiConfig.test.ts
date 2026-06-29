import { describe, expect, it } from 'vitest';
import { resolveOpenAiConfig } from './openaiConfig';

describe('resolveOpenAiConfig', () => {
  it('uses NUXT_OPENAI_API_KEY when runtimeConfig value is empty', () => {
    const config = resolveOpenAiConfig(
      {
        openaiApiKey: '',
        openaiModel: '',
      },
      {
        NUXT_OPENAI_API_KEY: 'sk-from-env',
        NUXT_OPENAI_MODEL: 'gpt-4o-mini',
      }
    );

    expect(config.apiKey).toBe('sk-from-env');
    expect(config.model).toBe('gpt-4o-mini');
  });
});

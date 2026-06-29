import { describe, expect, it } from 'vitest';
import { resolveTtsConfig } from './ttsConfig';

describe('resolveTtsConfig', () => {
  it('keeps TTS disabled unless the feature flag is explicitly true', () => {
    expect(
      resolveTtsConfig(
        { featureTtsEnabled: false, ttsModel: '', ttsVoice: '' },
        { NUXT_FEATURE_TTS_ENABLED: 'false' }
      )
    ).toMatchObject({ enabled: false });

    expect(
      resolveTtsConfig(
        { featureTtsEnabled: undefined, ttsModel: '', ttsVoice: '' },
        { NUXT_FEATURE_TTS_ENABLED: 'true' }
      )
    ).toMatchObject({ enabled: true });
  });

  it('uses OpenAI TTS defaults when env does not override them', () => {
    expect(resolveTtsConfig({}, {})).toMatchObject({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
    });
  });
});

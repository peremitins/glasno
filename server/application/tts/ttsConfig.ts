interface RuntimeTtsConfig {
  featureTtsEnabled?: unknown;
  ttsModel?: unknown;
  ttsVoice?: unknown;
}

type EnvMap = Record<string, string | undefined>;

export function resolveTtsConfig(
  runtimeConfig: RuntimeTtsConfig,
  env: EnvMap = process.env
) {
  return {
    enabled:
      normalizeBoolean(runtimeConfig.featureTtsEnabled) ??
      normalizeBoolean(env.NUXT_FEATURE_TTS_ENABLED) ??
      false,
    model:
      normalizeString(runtimeConfig.ttsModel) ||
      normalizeString(env.NUXT_OPENAI_TTS_MODEL) ||
      'gpt-4o-mini-tts',
    voice:
      normalizeString(runtimeConfig.ttsVoice) ||
      normalizeString(env.NUXT_OPENAI_TTS_VOICE) ||
      'alloy',
  };
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

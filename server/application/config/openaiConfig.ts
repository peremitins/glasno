interface RuntimeOpenAiConfig {
  openaiApiKey?: unknown;
  openaiModel?: unknown;
}

type EnvMap = Record<string, string | undefined>;

export function resolveOpenAiConfig(
  runtimeConfig: RuntimeOpenAiConfig,
  env: EnvMap = process.env
) {
  const apiKey =
    normalizeSecret(runtimeConfig.openaiApiKey) ||
    normalizeSecret(env.NUXT_OPENAI_API_KEY) ||
    normalizeSecret(env.OPENAI_API_KEY);

  const model =
    normalizeSecret(runtimeConfig.openaiModel) ||
    normalizeSecret(env.NUXT_OPENAI_MODEL) ||
    normalizeSecret(env.OPENAI_MODEL) ||
    'gpt-5.4-nano'; // была 'gpt-4o-mini' (заменено 2026-07)

  return { apiKey, model };
}

function normalizeSecret(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

interface RuntimeOpenAiConfig {
  openaiApiKey?: unknown;
  openaiModel?: unknown;
  openaiLearningModel?: unknown;
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

  // Подсказки-термины — массовые и простые вызовы: у них своя, самая дешёвая
  // модель, чтобы смена основной модели интервью их не удорожала.
  const learningModel =
    normalizeSecret(runtimeConfig.openaiLearningModel) ||
    normalizeSecret(env.NUXT_OPENAI_LEARNING_MODEL) ||
    normalizeSecret(env.OPENAI_LEARNING_MODEL) ||
    'gpt-5-nano';

  return { apiKey, model, learningModel };
}

function normalizeSecret(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

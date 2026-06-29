// Прайс-лист OpenAI (USD за 1M токенов / символов).
// АКТУАЛЬНОСТЬ: середина 2026. Перед прод-расчётами сверь с
// https://developers.openai.com/api/docs/pricing — особенно audio/realtime/tts,
// которые тарифицируются иначе и часто меняются (поэтому помечены note='verify').

export interface ModelPricing {
  inputPerMTokensUsd: number;
  cachedInputPerMTokensUsd: number;
  outputPerMTokensUsd: number;
  audioInputPerMTokensUsd: number;
  audioOutputPerMTokensUsd: number;
  ttsPerMCharsUsd: number;
  note?: string;
}

const ZERO: ModelPricing = {
  inputPerMTokensUsd: 0,
  cachedInputPerMTokensUsd: 0,
  outputPerMTokensUsd: 0,
  audioInputPerMTokensUsd: 0,
  audioOutputPerMTokensUsd: 0,
  ttsPerMCharsUsd: 0,
  note: 'unknown model — стоимость не рассчитана, заполни прайс',
};

export const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4o-mini': {
    ...ZERO,
    inputPerMTokensUsd: 0.15,
    cachedInputPerMTokensUsd: 0.075,
    outputPerMTokensUsd: 0.6,
    note: undefined,
  },
  'gpt-4o': {
    ...ZERO,
    inputPerMTokensUsd: 2.5,
    cachedInputPerMTokensUsd: 1.25,
    outputPerMTokensUsd: 10,
    note: undefined,
  },
  'gpt-4o-mini-tts': {
    ...ZERO,
    inputPerMTokensUsd: 0.6,
    ttsPerMCharsUsd: 15,
    note: 'verify: TTS тарифицируется по аудио/символам',
  },
  'gpt-realtime': {
    ...ZERO,
    inputPerMTokensUsd: 4,
    outputPerMTokensUsd: 16,
    audioInputPerMTokensUsd: 32,
    audioOutputPerMTokensUsd: 64,
    note: 'verify: realtime аудио тарифицируется по аудио-токенам/секундам',
  },
};

// Снимаем суффикс с датой/версией: gpt-4o-mini-2024-07-18 -> gpt-4o-mini.
function baseModel(model: string): string {
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

export function pricingForModel(model: string): ModelPricing {
  return OPENAI_PRICING[model] || OPENAI_PRICING[baseModel(model)] || ZERO;
}

export interface UsageAmounts {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
  characters?: number;
}

// Стоимость одного вызова в USD.
export function computeCostUsd(
  pricing: ModelPricing,
  usage: UsageAmounts
): number {
  const perM = (tokens: number | undefined, price: number) =>
    ((tokens || 0) / 1_000_000) * price;

  const cost =
    perM(usage.inputTokens, pricing.inputPerMTokensUsd) +
    perM(usage.cachedInputTokens, pricing.cachedInputPerMTokensUsd) +
    perM(usage.outputTokens, pricing.outputPerMTokensUsd) +
    perM(usage.audioInputTokens, pricing.audioInputPerMTokensUsd) +
    perM(usage.audioOutputTokens, pricing.audioOutputPerMTokensUsd) +
    perM(usage.characters, pricing.ttsPerMCharsUsd);

  // Округляем до 6 знаков (микродоллары).
  return Math.round(cost * 1_000_000) / 1_000_000;
}

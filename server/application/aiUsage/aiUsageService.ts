import type { AiUsageRepository } from '@/server/interface/aiUsageRepository';
import {
  OPENAI_PRICING,
  computeCostUsd,
  pricingForModel,
  type UsageAmounts,
} from './pricing';

export interface RecordAiUsageInput extends UsageAmounts {
  userId?: string | null;
  anonymousSessionId?: string | null;
  interviewSessionId?: string | null;
  kind: string;
  provider?: string;
  model: string;
  audioSeconds?: number;
  latencyMs?: number | null;
  requestId?: string | null;
  raw?: unknown;
}

export class AiUsageService {
  constructor(private readonly deps: { repository: AiUsageRepository }) {}

  // Записывает один вызов AI с расчётом стоимости. Никогда не бросает наружу —
  // учёт не должен ломать основной поток (вызывать как fire-and-forget).
  async record(input: RecordAiUsageInput): Promise<void> {
    const pricing = pricingForModel(input.model);
    const costUsd = computeCostUsd(pricing, input);
    const totalTokens =
      (input.inputTokens || 0) +
      (input.outputTokens || 0) +
      (input.audioInputTokens || 0) +
      (input.audioOutputTokens || 0);

    await this.deps.repository.record({
      userId: input.userId ?? null,
      anonymousSessionId: input.anonymousSessionId ?? null,
      interviewSessionId: input.interviewSessionId ?? null,
      kind: input.kind,
      provider: input.provider ?? 'openai',
      model: input.model,
      inputTokens: input.inputTokens ?? 0,
      cachedInputTokens: input.cachedInputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      totalTokens,
      audioSeconds: input.audioSeconds ?? 0,
      characters: input.characters ?? 0,
      costUsd,
      latencyMs: input.latencyMs ?? null,
      requestId: input.requestId ?? null,
      raw: input.raw ?? null,
    });
  }

  // Сидирование прайс-листа из кода в таблицу (для аналитики/переопределения).
  async seedPricing(): Promise<void> {
    const rows = Object.entries(OPENAI_PRICING).map(([model, p]) => ({
      model,
      provider: 'openai',
      inputPerMTokensUsd: p.inputPerMTokensUsd,
      cachedInputPerMTokensUsd: p.cachedInputPerMTokensUsd,
      outputPerMTokensUsd: p.outputPerMTokensUsd,
      audioInputPerMTokensUsd: p.audioInputPerMTokensUsd,
      audioOutputPerMTokensUsd: p.audioOutputPerMTokensUsd,
      ttsPerMCharsUsd: p.ttsPerMCharsUsd,
      note: p.note ?? null,
    }));
    await this.deps.repository.upsertPricing(rows);
  }
}

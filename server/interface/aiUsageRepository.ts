export interface AiUsageRow {
  userId?: string | null;
  anonymousSessionId?: string | null;
  interviewSessionId?: string | null;
  kind: string;
  provider?: string;
  model: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  audioSeconds?: number;
  characters?: number;
  costUsd: number;
  latencyMs?: number | null;
  requestId?: string | null;
  raw?: unknown;
}

export interface AiModelPricingRow {
  model: string;
  provider?: string;
  inputPerMTokensUsd: number;
  cachedInputPerMTokensUsd: number;
  outputPerMTokensUsd: number;
  audioInputPerMTokensUsd: number;
  audioOutputPerMTokensUsd: number;
  ttsPerMCharsUsd: number;
  note?: string | null;
}

export interface AiUsageRepository {
  record(row: AiUsageRow): Promise<void>;
  upsertPricing(rows: AiModelPricingRow[]): Promise<void>;
}

import { getDb, schema } from '@/server/infrastructure/db/client';
import type {
  AiModelPricingRow,
  AiUsageRepository,
  AiUsageRow,
} from '@/server/interface/aiUsageRepository';

export class DrizzleAiUsageRepository implements AiUsageRepository {
  private readonly db = getDb();

  async record(row: AiUsageRow): Promise<void> {
    await this.db.insert(schema.aiUsage).values({
      userId: row.userId ?? null,
      anonymousSessionId: row.anonymousSessionId ?? null,
      interviewSessionId: row.interviewSessionId ?? null,
      kind: row.kind,
      provider: row.provider ?? 'openai',
      model: row.model,
      inputTokens: row.inputTokens ?? 0,
      cachedInputTokens: row.cachedInputTokens ?? 0,
      outputTokens: row.outputTokens ?? 0,
      totalTokens: row.totalTokens ?? 0,
      audioSeconds: row.audioSeconds ?? 0,
      characters: row.characters ?? 0,
      costUsd: row.costUsd,
      latencyMs: row.latencyMs ?? null,
      requestId: row.requestId ?? null,
      raw: (row.raw ?? null) as Record<string, unknown> | null,
    });
  }

  async upsertPricing(rows: AiModelPricingRow[]): Promise<void> {
    for (const row of rows) {
      await this.db
        .insert(schema.aiModelPricing)
        .values({
          model: row.model,
          provider: row.provider ?? 'openai',
          inputPerMTokensUsd: row.inputPerMTokensUsd,
          cachedInputPerMTokensUsd: row.cachedInputPerMTokensUsd,
          outputPerMTokensUsd: row.outputPerMTokensUsd,
          audioInputPerMTokensUsd: row.audioInputPerMTokensUsd,
          audioOutputPerMTokensUsd: row.audioOutputPerMTokensUsd,
          ttsPerMCharsUsd: row.ttsPerMCharsUsd,
          note: row.note ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.aiModelPricing.model,
          set: {
            inputPerMTokensUsd: row.inputPerMTokensUsd,
            cachedInputPerMTokensUsd: row.cachedInputPerMTokensUsd,
            outputPerMTokensUsd: row.outputPerMTokensUsd,
            audioInputPerMTokensUsd: row.audioInputPerMTokensUsd,
            audioOutputPerMTokensUsd: row.audioOutputPerMTokensUsd,
            ttsPerMCharsUsd: row.ttsPerMCharsUsd,
            note: row.note ?? null,
            updatedAt: new Date(),
          },
        });
    }
  }
}

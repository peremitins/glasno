import { DrizzleAiUsageRepository } from '@/server/infrastructure/aiUsage/drizzleAiUsageRepository';
import { AiUsageService } from './aiUsageService';
import type { RecordAiUsageInput } from './aiUsageService';

let repository: DrizzleAiUsageRepository | null = null;

export function createAiUsageService(): AiUsageService {
  if (!repository) repository = new DrizzleAiUsageRepository();
  return new AiUsageService({ repository });
}

// Fire-and-forget запись: учёт не должен ломать основной поток.
export function recordAiUsageSafe(input: RecordAiUsageInput): void {
  void createAiUsageService()
    .record(input)
    .catch(() => {
      // глотаем — учёт не критичен для ответа пользователю
    });
}

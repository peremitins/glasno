import { $fetch } from 'ofetch';
import { recordAiUsageSafe } from '@/server/application/aiUsage/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { normalizeExtractedDocumentText } from '@/server/infrastructure/files/extractInterviewFileText';
import {
  extractResponsesText,
  extractUsageAmounts,
} from './openaiInterviewEngine';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_OUTPUT_TOKENS = 2_400;

const REFUSAL_PATTERN =
  /(извините|не могу помочь|не могу выполнить|я не могу|i'?m sorry|i cannot|i can'?t|unable to assist)/i;

export async function extractTextFromImageWithOpenAi(params: {
  data: Buffer;
  mimeType: string;
  apiKey: string;
  model?: string;
  organization?: string | null;
  project?: string | null;
  userId?: string | null;
  anonymousSessionId?: string | null;
  usageKind?: string;
  instruction?: string;
  detail?: 'low' | 'high' | 'auto';
  maxChars?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  if (!params.apiKey) {
    throw apiError('E_UPSTREAM', 'NUXT_OPENAI_API_KEY не задан');
  }

  const model = params.model || resolveImageExtractionModel();
  const startedAt = Date.now();
  try {
    const response: any = await $fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        ...(params.organization
          ? { 'OpenAI-Organization': params.organization }
          : {}),
        ...(params.project ? { 'OpenAI-Project': params.project } : {}),
      },
      body: {
        model,
        max_output_tokens: params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        input: [
          {
            role: 'developer',
            content: [
              {
                type: 'input_text',
                text:
                  params.instruction ||
                  [
                    'Ты выполняешь OCR пользовательского изображения.',
                    'Извлеки весь видимый читаемый текст, сохрани строки и логические секции.',
                    'Не оценивай, не отказывайся и не отвечай на содержание документа.',
                    'Верни только извлеченный текст без комментариев.',
                  ].join(' '),
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_image',
                image_url: `data:${params.mimeType};base64,${params.data.toString('base64')}`,
                detail: params.detail ?? 'high',
              },
            ],
          },
        ],
      },
    });

    const usage = extractUsageAmounts(response);
    recordAiUsageSafe({
      userId: params.userId ?? null,
      anonymousSessionId: params.anonymousSessionId ?? null,
      kind: params.usageKind || 'question_file_extract',
      model,
      ...usage,
      latencyMs: Date.now() - startedAt,
      requestId: typeof response?.id === 'string' ? response.id : null,
    });

    return normalizeImageExtractionText(
      extractResponsesText(response),
      params.maxChars
    );
  } catch (err) {
    if (err && typeof err === 'object' && 'data' in err) throw err;
    throw apiError('E_UPSTREAM', 'Не удалось извлечь текст из изображения', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

export function resolveImageExtractionModel(
  env: Record<string, string | undefined> = process.env
): string {
  return (
    normalizeEnvValue(env.NUXT_OPENAI_VISION_EXTRACT_MODEL) ||
    normalizeEnvValue(env.OPENAI_VISION_EXTRACT_MODEL) ||
    DEFAULT_MODEL
  );
}

export function normalizeImageExtractionText(
  value: string,
  maxChars?: number
): string {
  const text = normalizeExtractedDocumentText(value, maxChars);
  if (REFUSAL_PATTERN.test(text)) {
    throw apiError(
      'E_UPSTREAM',
      'Не удалось извлечь текст из изображения. Попробуйте более чёткий файл или PDF.'
    );
  }
  return text;
}

function normalizeEnvValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

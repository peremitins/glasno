import { $fetch } from 'ofetch';
import { recordAiUsageSafe } from '@/server/application/aiUsage/serviceFactory';
import { apiError } from '@/server/utils/errors';
import {
  extractResponsesText,
  extractUsageAmounts,
} from './openaiInterviewEngine';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4o-mini';

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
}): Promise<string> {
  if (!params.apiKey) {
    throw apiError('E_UPSTREAM', 'NUXT_OPENAI_API_KEY не задан');
  }

  const model = params.model || DEFAULT_MODEL;
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
        max_output_tokens: 1200,
        input: [
          {
            role: 'developer',
            content: [
              {
                type: 'input_text',
                text:
                  params.instruction ||
                  [
                    'Извлеки весь читаемый текст с изображения.',
                    'Верни только текст без комментариев.',
                    'Если на изображении список вопросов, сохрани вопросы отдельными строками.',
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

    const text = extractResponsesText(response);
    if (!text) {
      throw apiError('E_VALIDATION', 'На изображении не найден читаемый текст');
    }
    return text;
  } catch (err) {
    if (err && typeof err === 'object' && 'data' in err) throw err;
    throw apiError('E_UPSTREAM', 'Не удалось извлечь текст из изображения', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

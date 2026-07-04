import { createHash, createHmac, randomUUID } from 'node:crypto';
import { $fetch } from 'ofetch';
import { apiError, isApiError } from '@/server/utils/errors';

export type OpenAiResponsesPurpose =
  | 'answer_eval'
  | 'interview_converse'
  | 'interview_converse_stream'
  | 'learning_term_explain'
  | 'learning_terms_extract'
  | 'ocr'
  | 'question_file_extract'
  | 'question_generate'
  | 'question_hints'
  | 'question_sample_hint'
  | 'report'
  | 'other';

type EnvMap = Record<string, string | undefined>;

interface RelayRequestInput {
  path: string;
  purpose: OpenAiResponsesPurpose | string;
  body?: unknown;
  env?: EnvMap;
  requestId?: string;
  timestamp?: string;
  nonce?: string;
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const RELAY_DEFAULT_TIMEOUT_MS = 60_000;

function hasValue(value?: string | null): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function isRelayEnabled(env: EnvMap = process.env): boolean {
  if (env.AI_USE_RELAY === 'true') return true;
  if (env.AI_USE_RELAY === 'false') return false;
  return hasValue(env.AI_RELAY_URL);
}

export function buildRelayRequest(input: RelayRequestInput) {
  const env = input.env ?? process.env;
  const relayUrl = normalizeRelayUrl(env.AI_RELAY_URL);
  const relaySecret = env.AI_RELAY_AUTH_SECRET?.trim();
  const relayClientId = env.AI_RELAY_CLIENT_ID?.trim();

  if (!relayUrl || !relaySecret || !relayClientId) {
    throw apiError('E_UPSTREAM', 'Провайдер обработки не настроен');
  }

  const rawBody = JSON.stringify(input.body ?? {});
  const timestamp = input.timestamp ?? String(Date.now());
  const nonce = input.nonce ?? randomUUID();
  const requestId = input.requestId ?? randomUUID();
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const canonical = [
    'POST',
    input.path,
    timestamp,
    nonce,
    bodyHash,
    relayClientId,
  ].join('\n');
  const signature = createHmac('sha256', relaySecret)
    .update(canonical)
    .digest('base64');

  return {
    url: `${relayUrl}${input.path}`,
    rawBody,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Relay-Client': relayClientId,
      'X-Relay-Timestamp': timestamp,
      'X-Relay-Nonce': nonce,
      'X-Relay-Signature': signature,
      'X-Purpose': input.purpose,
      'X-Request-Id': requestId,
    },
  };
}

export async function sendOpenAiResponsesRequest<T = unknown>(params: {
  body: unknown;
  purpose: OpenAiResponsesPurpose | string;
  timeoutMs?: number;
  apiKey?: string;
  organization?: string | null;
  project?: string | null;
  env?: EnvMap;
}): Promise<T> {
  if (isRelayEnabled(params.env)) {
    const request = buildRelayRequest({
      path: '/v1/responses',
      body: params.body as Record<string, any>,
      purpose: params.purpose,
      env: params.env,
    });

    try {
      return await $fetch<T>(request.url, {
        method: 'POST',
        headers: request.headers,
        timeout: params.timeoutMs ?? RELAY_DEFAULT_TIMEOUT_MS,
        body: request.rawBody,
      });
    } catch (err) {
      throwProviderError(err, 'Провайдер обработки временно недоступен');
    }
  }

  if (!params.apiKey) {
    throw apiError('E_UPSTREAM', 'Провайдер обработки не настроен');
  }

  try {
    return await $fetch<T>(OPENAI_RESPONSES_URL, {
      method: 'POST',
      timeout: params.timeoutMs,
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        ...(params.organization
          ? { 'OpenAI-Organization': params.organization }
          : {}),
        ...(params.project ? { 'OpenAI-Project': params.project } : {}),
      },
      body: params.body as Record<string, any>,
    });
  } catch (err) {
    throwProviderError(err, 'Провайдер обработки временно недоступен');
  }
}

function normalizeRelayUrl(value: string | undefined): string {
  const normalized = value?.trim().replace(/\/+$/u, '') ?? '';
  return normalized;
}

function throwProviderError(error: unknown, fallbackMessage: string): never {
  if (isApiError(error)) {
    throw error;
  }
  throw apiError('E_UPSTREAM', fallbackMessage, {
    cause: error instanceof Error ? error.message : String(error),
  });
}

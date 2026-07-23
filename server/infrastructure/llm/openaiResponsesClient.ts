import { createHash, createHmac, randomUUID } from 'node:crypto';
import { $fetch } from 'ofetch';
import { apiError, isApiError } from '@/server/utils/errors';
import { logger } from '@/server/utils/logger';

export type OpenAiResponsesPurpose =
  | 'answer_eval'
  | 'interview_converse'
  | 'interview_converse_stream'
  | 'learning_term_explain'
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

export function assertDirectOpenAiAccessAllowed(
  env: EnvMap = process.env
): void {
  if (isRelayEnabled(env)) {
    throw apiError(
      'E_UPSTREAM',
      'Этот режим пока не поддерживается через AI Relay'
    );
  }
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

const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

// SDP-обмен для WebRTC realtime-voice: тот же relay, что и /v1/responses
// (нужен для доступа из РФ), но relay поддерживает только этот путь и
// /v1/responses — /v1/realtime/client_secrets он не проксирует.
export async function sendOpenAiRealtimeCallRequest(params: {
  sdp: string;
  session: Record<string, unknown>;
  timeoutMs?: number;
  apiKey?: string;
  env?: EnvMap;
}): Promise<string> {
  if (isRelayEnabled(params.env)) {
    const request = buildRelayRequest({
      path: '/v1/realtime/calls',
      body: { sdp: params.sdp, session: params.session },
      purpose: 'realtime_call',
      env: params.env,
    });

    try {
      return await $fetch<string, 'text'>(request.url, {
        method: 'POST',
        headers: request.headers,
        timeout: params.timeoutMs ?? RELAY_DEFAULT_TIMEOUT_MS,
        body: request.rawBody,
        responseType: 'text',
      });
    } catch (err) {
      throwProviderError(err, 'Не удалось запустить голосовой режим');
    }
  }

  if (!params.apiKey) {
    throw apiError('E_UPSTREAM', 'Провайдер голосового режима не настроен');
  }

  // Прямой вызов OpenAI (без relay): sdp+session одной multipart-формой —
  // тот же контракт GA Realtime API, что использует и сам relay.
  const form = new FormData();
  form.set('sdp', params.sdp);
  form.set('session', JSON.stringify(params.session));

  try {
    return await $fetch<string, 'text'>(OPENAI_REALTIME_CALLS_URL, {
      method: 'POST',
      timeout: params.timeoutMs,
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: form,
      responseType: 'text',
    });
  } catch (err) {
    throwProviderError(err, 'Не удалось запустить голосовой режим');
  }
}

function normalizeRelayUrl(value: string | undefined): string {
  const normalized = value?.trim().replace(/\/+$/u, '') ?? '';
  return normalized;
}

// Причину падения надо сохранять подробно: без неё «провайдер недоступен»
// одинаково выглядит и при реальном сбое OpenAI, и при нашем некорректном
// запросе (400) или таймауте — понять, чья это ошибка, невозможно.
function describeProviderFailure(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const raw = error as Error & {
    statusCode?: number;
    status?: number;
    data?: unknown;
    cause?: unknown;
  };
  const status = raw.statusCode ?? raw.status;
  const body =
    typeof raw.data === 'string'
      ? raw.data
      : raw.data
        ? JSON.stringify(raw.data)
        : '';
  const causeCode =
    raw.cause && typeof raw.cause === 'object' && 'code' in raw.cause
      ? String((raw.cause as { code: unknown }).code)
      : '';

  return [
    raw.message,
    status ? `status=${status}` : '',
    causeCode ? `code=${causeCode}` : '',
    body ? `body=${body.slice(0, 800)}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function throwProviderError(error: unknown, fallbackMessage: string): never {
  if (isApiError(error)) {
    throw error;
  }
  const details = describeProviderFailure(error);
  logger.error({ err: error, details }, '[openai] provider request failed');
  throw apiError('E_UPSTREAM', fallbackMessage, {
    cause: details,
  });
}

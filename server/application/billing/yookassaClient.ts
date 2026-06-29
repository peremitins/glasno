import { $fetch } from 'ofetch';
import { apiError } from '@/server/utils/errors';

export interface YooKassaConfig {
  shopId: string;
  secretKey: string;
}

export interface BuildYooKassaPaymentRequestInput extends YooKassaConfig {
  idempotenceKey: string;
  amountRub: number;
  returnUrl: string;
  description: string;
  metadata: Record<string, string>;
}

export interface YooKassaCreatePaymentResponse {
  id: string;
  status: string;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
}

export interface YooKassaPaymentEvent {
  event: string;
  providerPaymentId: string;
  status: string;
  paid: boolean;
  orderId: string | null;
  userId: string | null;
  planId: string | null;
}

export function buildYooKassaCreatePaymentRequest(
  input: BuildYooKassaPaymentRequestInput
) {
  return {
    url: 'https://api.yookassa.ru/v3/payments',
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${input.shopId}:${input.secretKey}`
      ).toString('base64')}`,
      'Idempotence-Key': input.idempotenceKey,
      'Content-Type': 'application/json',
    },
    body: {
      amount: {
        value: formatRub(input.amountRub),
        currency: 'RUB',
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: input.returnUrl,
      },
      description: input.description.slice(0, 128),
      metadata: input.metadata,
    },
  };
}

export async function createYooKassaPayment(
  input: BuildYooKassaPaymentRequestInput
): Promise<YooKassaCreatePaymentResponse> {
  const request = buildYooKassaCreatePaymentRequest(input);
  return await $fetch<YooKassaCreatePaymentResponse>(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });
}

export interface YooKassaPaymentInfo {
  id: string;
  status: string;
  paid: boolean;
  amountValue: string | null;
  currency: string | null;
  metadata: Record<string, unknown>;
}

// Обратный запрос статуса платежа. Используется для ВЕРИФИКАЦИИ вебхука:
// телу вебхука доверять нельзя, поэтому статус подтверждаем у YooKassa.
export async function getYooKassaPayment(
  config: YooKassaConfig,
  paymentId: string
): Promise<YooKassaPaymentInfo> {
  const response = await $fetch<{
    id: string;
    status: string;
    paid?: boolean;
    amount?: { value?: string; currency?: string };
    metadata?: Record<string, unknown>;
  }>(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    timeout: 20_000,
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${config.shopId}:${config.secretKey}`
      ).toString('base64')}`,
    },
  });

  return {
    id: response.id,
    status: response.status,
    paid: response.paid === true,
    amountValue: response.amount?.value ?? null,
    currency: response.amount?.currency ?? null,
    metadata: response.metadata ?? {},
  };
}

export function getYooKassaConfirmationUrl(
  response: YooKassaCreatePaymentResponse
): string {
  const url = response.confirmation?.confirmation_url;
  if (!url) {
    throw apiError('E_UPSTREAM', 'YooKassa не вернула ссылку на оплату');
  }
  return url;
}

export function extractYooKassaPaymentEvent(
  payload: unknown
): YooKassaPaymentEvent {
  const data = payload as {
    event?: unknown;
    object?: {
      id?: unknown;
      status?: unknown;
      paid?: unknown;
      metadata?: Record<string, unknown>;
    };
  };

  const providerPaymentId =
    typeof data.object?.id === 'string' ? data.object.id : null;
  const status =
    typeof data.object?.status === 'string' ? data.object.status : null;
  const event = typeof data.event === 'string' ? data.event : null;
  if (!providerPaymentId || !status || !event) {
    throw apiError('E_VALIDATION', 'Некорректный webhook YooKassa');
  }

  const metadata = data.object?.metadata || {};
  return {
    event,
    providerPaymentId,
    status,
    paid: data.object?.paid === true,
    orderId: asString(metadata.orderId),
    userId: asString(metadata.userId),
    planId: asString(metadata.planId),
  };
}

function formatRub(value: number): string {
  return `${value.toFixed(2)}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}


import { $fetch } from 'ofetch';
import { apiError } from '@/server/utils/errors';

export interface YooKassaConfig {
  shopId: string;
  secretKey: string;
}

export interface YooKassaReceipt {
  customer: { email: string };
  items: Array<{
    description: string;
    quantity: string;
    amount: { value: string; currency: 'RUB' };
    vat_code: number;
    payment_mode: string;
    payment_subject: string;
  }>;
}

export interface BuildYooKassaPaymentRequestInput extends YooKassaConfig {
  idempotenceKey: string;
  amountRub: number;
  returnUrl: string;
  description: string;
  metadata: Record<string, string>;
  receipt?: YooKassaReceipt;
  // Сохранить карту для будущих автосписаний (первый платёж подписки).
  savePaymentMethod?: boolean;
}

// Server-to-server списание с сохранённой карты (автопродление).
// Без confirmation: YooKassa проводит платёж по payment_method_id.
export interface BuildYooKassaRecurringPaymentInput extends YooKassaConfig {
  idempotenceKey: string;
  amountRub: number;
  description: string;
  metadata: Record<string, string>;
  paymentMethodId: string;
  receipt?: YooKassaReceipt;
}

/**
 * Чек для 54-ФЗ (реализация по образцу Mentala).
 * vat_code 1 = без НДС, payment_subject 'service' — услуга.
 */
export function buildYooKassaReceipt(params: {
  email: string;
  amountRub: number;
  description: string;
}): YooKassaReceipt {
  return {
    customer: { email: params.email },
    items: [
      {
        description: params.description.slice(0, 128),
        quantity: '1.00',
        amount: {
          value: formatRub(params.amountRub),
          currency: 'RUB',
        },
        vat_code: 1,
        payment_mode: 'full_payment',
        payment_subject: 'service',
      },
    ],
  };
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
  const body: Record<string, unknown> = {
    amount: {
      value: formatRub(input.amountRub),
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: input.returnUrl,
      locale: 'ru_RU',
    },
    description: input.description.slice(0, 128),
    metadata: input.metadata,
  };
  if (input.receipt) {
    body.receipt = input.receipt;
  }
  if (input.savePaymentMethod) {
    body.save_payment_method = true;
  }

  return {
    url: 'https://api.yookassa.ru/v3/payments',
    headers: yookassaHeaders(input, input.idempotenceKey),
    body,
  };
}

export function buildYooKassaRecurringPaymentRequest(
  input: BuildYooKassaRecurringPaymentInput
) {
  const body: Record<string, unknown> = {
    amount: {
      value: formatRub(input.amountRub),
      currency: 'RUB',
    },
    capture: true,
    payment_method_id: input.paymentMethodId,
    description: input.description.slice(0, 128),
    metadata: input.metadata,
  };
  if (input.receipt) {
    body.receipt = input.receipt;
  }

  return {
    url: 'https://api.yookassa.ru/v3/payments',
    headers: yookassaHeaders(input, input.idempotenceKey),
    body,
  };
}

export async function createYooKassaRecurringPayment(
  input: BuildYooKassaRecurringPaymentInput
): Promise<YooKassaCreatePaymentResponse> {
  const request = buildYooKassaRecurringPaymentRequest(input);
  return await $fetch<YooKassaCreatePaymentResponse>(request.url, {
    method: 'POST',
    timeout: 20_000,
    headers: request.headers,
    body: request.body,
  });
}

function yookassaHeaders(config: YooKassaConfig, idempotenceKey: string) {
  return {
    Authorization: `Basic ${Buffer.from(
      `${config.shopId}:${config.secretKey}`
    ).toString('base64')}`,
    'Idempotence-Key': idempotenceKey,
    'Content-Type': 'application/json',
  };
}

export interface YooKassaPaymentMethodResponse {
  id: string;
  type?: string;
  saved?: boolean;
  status?: string;
  title?: string;
  card?: {
    card_type?: string;
    last4?: string;
    expiry_month?: string;
    expiry_year?: string;
  };
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
}

// Привязка карты БЕЗ платежа (по образцу Mentala): YooKassa возвращает
// confirmation_url, пользователь подтверждает карту на стороне банка.
// Требует включённую опцию «Сохранение платёжных методов» в ЛК YooKassa.
export async function createYooKassaPaymentMethodBinding(params: {
  shopId: string;
  secretKey: string;
  idempotenceKey: string;
  returnUrl: string;
}): Promise<YooKassaPaymentMethodResponse> {
  return await $fetch<YooKassaPaymentMethodResponse>(
    'https://api.yookassa.ru/v3/payment_methods',
    {
      method: 'POST',
      timeout: 15_000,
      headers: yookassaHeaders(params, params.idempotenceKey),
      body: {
        type: 'bank_card',
        confirmation: {
          type: 'redirect',
          return_url: params.returnUrl,
        },
      },
    }
  );
}

export async function getYooKassaPaymentMethod(
  config: YooKassaConfig,
  paymentMethodId: string
): Promise<YooKassaPaymentMethodResponse> {
  return await $fetch<YooKassaPaymentMethodResponse>(
    `https://api.yookassa.ru/v3/payment_methods/${encodeURIComponent(paymentMethodId)}`,
    {
      method: 'GET',
      timeout: 15_000,
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${config.shopId}:${config.secretKey}`
        ).toString('base64')}`,
      },
    }
  );
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

// Презентация сохранённого способа оплаты (по образцу Mentala):
// сам PAN хранит YooKassa, нам доступны только маска и тип.
export interface YooKassaPaymentMethodPresentation {
  id: string | null;
  saved: boolean;
  methodType: string | null;
  title: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpiryMonth: string | null;
  cardExpiryYear: string | null;
}

export interface YooKassaPaymentInfo {
  id: string;
  status: string;
  paid: boolean;
  amountValue: string | null;
  currency: string | null;
  metadata: Record<string, unknown>;
  paymentMethod: YooKassaPaymentMethodPresentation | null;
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
    payment_method?: {
      id?: string;
      saved?: boolean;
      type?: string;
      title?: string;
      card?: {
        card_type?: string;
        last4?: string;
        expiry_month?: string;
        expiry_year?: string;
      };
    };
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
    paymentMethod: extractYooKassaPaymentMethod(response.payment_method),
  };
}

export function extractYooKassaPaymentMethod(
  paymentMethod:
    | {
        id?: string;
        saved?: boolean;
        type?: string;
        title?: string;
        card?: {
          card_type?: string;
          last4?: string;
          expiry_month?: string;
          expiry_year?: string;
        };
      }
    | null
    | undefined
): YooKassaPaymentMethodPresentation | null {
  if (!paymentMethod) return null;
  return {
    id: asString(paymentMethod.id),
    saved: paymentMethod.saved === true,
    methodType: asString(paymentMethod.type),
    title: asString(paymentMethod.title),
    cardBrand: asString(paymentMethod.card?.card_type),
    cardLast4: asString(paymentMethod.card?.last4),
    cardExpiryMonth: asString(paymentMethod.card?.expiry_month),
    cardExpiryYear: asString(paymentMethod.card?.expiry_year),
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


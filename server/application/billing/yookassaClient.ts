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
  description: string;
  metadata: Record<string, string>;
  receipt?: YooKassaReceipt;
  // Сохранить выбранный способ для будущих автосписаний (первый платёж).
  savePaymentMethod?: boolean;
  // Идентификатор покупателя в нашей системе. По документации виджета нужен,
  // чтобы сохранённая карта предлагалась при следующей оплате.
  merchantCustomerId?: string | null;
}

// Server-to-server списание с сохранённого способа оплаты (автопродление).
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
    // Для встроенного виджета (confirmation.type = embedded): токен,
    // с которым фронт инициализирует YooMoneyCheckoutWidget.
    confirmation_token?: string;
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
    // Встроенный виджет (Уровень 1): пользователь платит, не покидая Гласно.
    // return_url и locale передаёт фронт при инициализации виджета, поэтому
    // здесь их нет — в теле создания платежа для embedded они не нужны.
    confirmation: {
      type: 'embedded',
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
  if (input.merchantCustomerId) {
    body.merchant_customer_id = input.merchantCustomerId.slice(0, 200);
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
    // Привязка счёта СБП подтверждается ссылкой НСПК: на мобильном она
    // открывает выбор банка, на десктопе её показывают QR-кодом.
    confirmation_data?: string;
  };
}

export type YooKassaBindablePaymentMethodType = 'bank_card' | 'sbp';

// Привязка способа оплаты БЕЗ платежа («привязка на нулевую сумму»).
// Единственный способ получить идентификатор, пригодный для автосписаний:
// payment_method.id из обычного платежа таким идентификатором может НЕ быть
// (по СБП YooKassa возвращает там id самого платежа).
// Требует включённую опцию «Сохранение платёжных методов» в ЛК YooKassa.
export async function createYooKassaPaymentMethodBinding(params: {
  shopId: string;
  secretKey: string;
  idempotenceKey: string;
  returnUrl: string;
  methodType?: YooKassaBindablePaymentMethodType;
}): Promise<YooKassaPaymentMethodResponse> {
  const methodType = params.methodType ?? 'bank_card';
  return await $fetch<YooKassaPaymentMethodResponse>(
    'https://api.yookassa.ru/v3/payment_methods',
    {
      method: 'POST',
      timeout: 15_000,
      headers: yookassaHeaders(params, params.idempotenceKey),
      body: {
        type: methodType,
        confirmation:
          methodType === 'sbp'
            ? { type: 'qr', return_url: params.returnUrl }
            : { type: 'redirect', return_url: params.returnUrl },
      },
    }
  );
}

export function isYooKassaNotFound(error: unknown): boolean {
  const info = extractYooKassaApiError(error);
  return info.httpStatus === 404 || info.code === 'not_found';
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
  cancellationParty?: string | null;
  cancellationReason?: string | null;
  metadata: Record<string, unknown>;
  paymentMethod: YooKassaPaymentMethodPresentation | null;
}

export interface YooKassaApiErrorInfo {
  httpStatus: number | null;
  id: string | null;
  code: string | null;
  description: string | null;
  parameter: string | null;
  transportFailure: 'network' | 'timeout' | null;
}

export type YooKassaRecurringPaymentErrorKind =
  | 'invalid_payment_method'
  | 'transient'
  | 'indeterminate'
  | 'definitive_failure';

export function extractYooKassaApiError(
  error: unknown
): YooKassaApiErrorInfo {
  const errorRecord = asRecord(error);
  const responseRecord = asRecord(errorRecord?.response);
  const dataRecord =
    asRecord(errorRecord?.data) ?? asRecord(responseRecord?._data);
  const httpStatus =
    asHttpStatus(errorRecord?.statusCode) ??
    asHttpStatus(errorRecord?.status) ??
    asHttpStatus(responseRecord?.status);

  return {
    httpStatus,
    id: asString(dataRecord?.id),
    code: asString(dataRecord?.code),
    description: asString(dataRecord?.description),
    parameter: asString(dataRecord?.parameter),
    transportFailure:
      httpStatus === null && error !== null && error !== undefined
        ? isTimeoutError(error)
          ? 'timeout'
          : 'network'
        : null,
  };
}

export function formatYooKassaApiError(error: YooKassaApiErrorInfo): string {
  const details: string[] = [];
  if (error.httpStatus !== null) {
    details.push(`HTTP ${error.httpStatus}`);
  }
  if (error.transportFailure) {
    details.push(`transport=${error.transportFailure}`);
  }
  if (error.id) {
    details.push(`id=${sanitizeDiagnosticValue(error.id)}`);
  }
  if (error.code) {
    details.push(`code=${sanitizeDiagnosticValue(error.code)}`);
  }
  if (error.parameter) {
    details.push(`parameter=${sanitizeDiagnosticValue(error.parameter)}`);
  }
  if (error.description) {
    details.push(
      `description=${sanitizeDiagnosticValue(error.description)}`
    );
  }

  return details.length > 0
    ? `YooKassa API error: ${details.join('; ')}`
    : 'YooKassa API error';
}

export function classifyYooKassaRecurringPaymentError(
  error: YooKassaApiErrorInfo
): YooKassaRecurringPaymentErrorKind {
  // 429 означает ограничение частоты запросов, а не отказ платёжного метода.
  // Повторяем тот же запрос позже, не расходуя бизнес-попытку списания.
  if (error.httpStatus === 429 || error.code === 'too_many_requests') {
    return 'transient';
  }

  if (
    error.transportFailure !== null ||
    error.httpStatus === 408 ||
    (error.httpStatus !== null && error.httpStatus >= 500)
  ) {
    return 'indeterminate';
  }

  if (
    error.parameter === 'payment_method_id' &&
    (error.httpStatus === 400 ||
      error.httpStatus === 404 ||
      error.code === 'not_found')
  ) {
    return 'invalid_payment_method';
  }

  return 'definitive_failure';
}

interface YooKassaRawPayment {
  id: string;
  status: string;
  paid?: boolean;
  amount?: { value?: string; currency?: string };
  cancellation_details?: {
    party?: string;
    reason?: string;
  };
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
}

function mapYooKassaPayment(response: YooKassaRawPayment): YooKassaPaymentInfo {
  return {
    id: response.id,
    status: response.status,
    paid: response.paid === true,
    amountValue: response.amount?.value ?? null,
    currency: response.amount?.currency ?? null,
    cancellationParty: asString(response.cancellation_details?.party),
    cancellationReason: asString(response.cancellation_details?.reason),
    metadata: response.metadata ?? {},
    paymentMethod: extractYooKassaPaymentMethod(response.payment_method),
  };
}

// Обратный запрос статуса платежа. Используется для ВЕРИФИКАЦИИ вебхука:
// телу вебхука доверять нельзя, поэтому статус подтверждаем у YooKassa.
export async function getYooKassaPayment(
  config: YooKassaConfig,
  paymentId: string
): Promise<YooKassaPaymentInfo> {
  const response = await $fetch<YooKassaRawPayment>(
    `https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`,
    {
      method: 'GET',
      timeout: 20_000,
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${config.shopId}:${config.secretKey}`
        ).toString('base64')}`,
      },
    }
  );

  return mapYooKassaPayment(response);
}

export interface YooKassaPaymentsPage {
  items: YooKassaPaymentInfo[];
  nextCursor: string | null;
}

// Поиск платежа, когда его id не сохранился локально (процесс упал между
// POST и записью providerPaymentId). Список фильтруется датой создания,
// совпадение с заказом ищем по metadata.orderId — их пишет наш сервер при
// создании каждого платежа.
export async function listYooKassaPayments(
  config: YooKassaConfig,
  params: {
    createdAtGte: Date;
    createdAtLte: Date;
    cursor?: string | null;
    limit?: number;
  }
): Promise<YooKassaPaymentsPage> {
  const response = await $fetch<{
    items?: YooKassaRawPayment[];
    next_cursor?: string;
  }>('https://api.yookassa.ru/v3/payments', {
    method: 'GET',
    timeout: 20_000,
    query: {
      'created_at.gte': params.createdAtGte.toISOString(),
      'created_at.lte': params.createdAtLte.toISOString(),
      limit: params.limit ?? 100,
      ...(params.cursor ? { cursor: params.cursor } : {}),
    },
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${config.shopId}:${config.secretKey}`
      ).toString('base64')}`,
    },
  });

  return {
    items: (response.items ?? []).map(mapYooKassaPayment),
    nextCursor: asString(response.next_cursor),
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

export function getYooKassaConfirmationToken(
  response: YooKassaCreatePaymentResponse
): string {
  const token = response.confirmation?.confirmation_token;
  if (!token) {
    throw apiError('E_UPSTREAM', 'YooKassa не вернула токен для оплаты');
  }
  return token;
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

// Тип события верхнего уровня без разбора object. Нужен, чтобы отличить
// уведомления о способах оплаты (payment_method.*) от платёжных до того, как
// пытаться разбирать object как платёж.
export function extractYooKassaEventType(payload: unknown): string | null {
  const event = (payload as { event?: unknown } | null)?.event;
  return typeof event === 'string' ? event : null;
}

export interface YooKassaPaymentMethodEvent {
  event: string;
  paymentMethodId: string;
  saved: boolean;
  status: string | null;
  methodType: string | null;
}

// Уведомление о способе оплаты (payment_method.active и др.). object здесь —
// не платёж, а способ оплаты; телу webhook не доверяем, поэтому забираем
// только идентификатор, а пригодность подтверждаем обратным запросом.
export function extractYooKassaPaymentMethodEvent(
  payload: unknown
): YooKassaPaymentMethodEvent {
  const data = payload as {
    event?: unknown;
    object?: {
      id?: unknown;
      saved?: unknown;
      status?: unknown;
      type?: unknown;
    };
  };
  const event = typeof data.event === 'string' ? data.event : null;
  const paymentMethodId =
    typeof data.object?.id === 'string' ? data.object.id : null;
  if (!event || !paymentMethodId) {
    throw apiError(
      'E_VALIDATION',
      'Некорректный webhook способа оплаты YooKassa'
    );
  }
  return {
    event,
    paymentMethodId,
    saved: data.object?.saved === true,
    status: asString(data.object?.status),
    methodType: asString(data.object?.type),
  };
}

function formatRub(value: number): string {
  return `${value.toFixed(2)}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asHttpStatus(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : null;
}

function isTimeoutError(error: unknown): boolean {
  let current = asRecord(error);
  for (let depth = 0; current && depth < 4; depth += 1) {
    const signals = [current.name, current.code, current.message];
    if (
      signals.some(
        (signal) =>
          typeof signal === 'string' &&
          /(?:timeout|timed out|abort)/iu.test(signal)
      )
    ) {
      return true;
    }
    current = asRecord(current.cause);
  }
  return false;
}

function sanitizeDiagnosticValue(value: string): string {
  return value
    .replace(/\b(?:https?|ftp):\/\/\S+/giu, '[URL удалён]')
    .replace(/\bwww\.\S+/giu, '[URL удалён]')
    .replace(
      /\bAuthorization\s*:\s*(?:Basic|Bearer)\s+\S+/giu,
      'Authorization: [учётные данные удалены]'
    )
    .replace(
      /\b(?:Basic|Bearer)\s+\S+/giu,
      '[учётные данные удалены]'
    )
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 500);
}

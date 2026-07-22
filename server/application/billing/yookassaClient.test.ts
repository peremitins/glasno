import { $fetch } from 'ofetch';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as yookassaClient from './yookassaClient';
import {
  buildYooKassaCreatePaymentRequest,
  buildYooKassaRecurringPaymentRequest,
  classifyYooKassaRecurringPaymentError,
  extractYooKassaApiError,
  extractYooKassaPaymentEvent,
  formatYooKassaApiError,
  getYooKassaPayment,
} from './yookassaClient';

vi.mock('ofetch', () => ({
  $fetch: vi.fn(),
}));

const mockedFetch = vi.mocked($fetch);

describe('yookassaClient helpers', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('exports helpers for safe YooKassa error diagnostics', () => {
    expect(yookassaClient).toMatchObject({
      extractYooKassaApiError: expect.any(Function),
      formatYooKassaApiError: expect.any(Function),
      classifyYooKassaRecurringPaymentError: expect.any(Function),
    });
  });

  it('extracts structured YooKassa fields from an ofetch error', () => {
    const error = extractYooKassaApiError({
      name: 'FetchError',
      statusCode: 400,
      data: {
        id: 'error-id-1',
        code: 'invalid_request',
        description: 'Incorrect payment method ID',
        parameter: 'payment_method_id',
      },
    });

    expect(error).toEqual({
      httpStatus: 400,
      id: 'error-id-1',
      code: 'invalid_request',
      description: 'Incorrect payment method ID',
      parameter: 'payment_method_id',
      transportFailure: null,
    });
  });

  it('formats only safe structured diagnostics without URL or credentials', () => {
    const error = extractYooKassaApiError({
      name: 'FetchError',
      statusCode: 400,
      request:
        'https://123456:test_secret@api.yookassa.ru/v3/payments?token=secret',
      message:
        '[POST] https://123456:test_secret@api.yookassa.ru/v3/payments: 400',
      options: {
        headers: { Authorization: 'Basic MTIzNDU2OnRlc3Rfc2VjcmV0' },
      },
      data: {
        id: 'error-id-1',
        code: 'invalid_request',
        description:
          'Incorrect payment method. https://api.yookassa.ru/debug Authorization: Basic MTIzNDU2OnRlc3Rfc2VjcmV0',
        parameter: 'payment_method_id',
      },
    });

    const message = formatYooKassaApiError(error);

    expect(message).toContain('HTTP 400');
    expect(message).toContain('id=error-id-1');
    expect(message).toContain('code=invalid_request');
    expect(message).toContain('parameter=payment_method_id');
    expect(message).toContain('description=Incorrect payment method.');
    expect(message).not.toContain('https://');
    expect(message).not.toContain('test_secret');
    expect(message).not.toContain('MTIzNDU2OnRlc3Rfc2VjcmV0');
  });

  it('classifies only a payment_method_id API error as an invalid saved method', () => {
    const invalidMethod = extractYooKassaApiError({
      statusCode: 400,
      data: {
        code: 'invalid_request',
        parameter: 'payment_method_id',
      },
    });
    const missingMethod = extractYooKassaApiError({
      statusCode: 404,
      data: {
        code: 'not_found',
        parameter: 'payment_method_id',
      },
    });
    const missingPayment = extractYooKassaApiError({
      statusCode: 404,
      data: {
        code: 'not_found',
        parameter: 'payment_id',
      },
    });

    expect(classifyYooKassaRecurringPaymentError(invalidMethod)).toBe(
      'invalid_payment_method'
    );
    expect(classifyYooKassaRecurringPaymentError(missingMethod)).toBe(
      'invalid_payment_method'
    );
    expect(classifyYooKassaRecurringPaymentError(missingPayment)).toBe(
      'definitive_failure'
    );
  });

  it('classifies transport errors, timeouts, and HTTP 5xx as indeterminate', () => {
    const networkError = extractYooKassaApiError(
      new TypeError('fetch failed')
    );
    const timeoutError = extractYooKassaApiError({
      name: 'FetchError',
      cause: { name: 'AbortError' },
    });
    const upstreamError = extractYooKassaApiError({
      statusCode: 503,
      data: { code: 'internal_server_error' },
    });

    expect(networkError.transportFailure).toBe('network');
    expect(timeoutError.transportFailure).toBe('timeout');
    expect(classifyYooKassaRecurringPaymentError(networkError)).toBe(
      'indeterminate'
    );
    expect(classifyYooKassaRecurringPaymentError(timeoutError)).toBe(
      'indeterminate'
    );
    expect(classifyYooKassaRecurringPaymentError(upstreamError)).toBe(
      'indeterminate'
    );
  });

  it('classifies YooKassa rate limiting as transient, not a payment refusal', () => {
    const rateLimited = extractYooKassaApiError({
      statusCode: 429,
      data: { code: 'too_many_requests' },
    });

    expect(classifyYooKassaRecurringPaymentError(rateLimited)).toBe(
      'transient'
    );
  });

  it('builds an embedded-widget payment request with idempotence key and metadata', () => {
    const request = buildYooKassaCreatePaymentRequest({
      shopId: '123456',
      secretKey: 'test_secret',
      idempotenceKey: 'payment_order_1',
      amountRub: 990,
      description: 'Гласно Pro',
      metadata: {
        orderId: 'payment_order_1',
        userId: 'user_1',
        planId: 'pro_monthly',
      },
    });

    expect(request.url).toBe('https://api.yookassa.ru/v3/payments');
    expect(request.headers['Idempotence-Key']).toBe('payment_order_1');
    expect(request.headers.Authorization).toMatch(/^Basic /);
    expect(request.body).toMatchObject({
      amount: { value: '990.00', currency: 'RUB' },
      capture: true,
      confirmation: {
        type: 'embedded',
      },
      metadata: {
        orderId: 'payment_order_1',
        userId: 'user_1',
        planId: 'pro_monthly',
      },
    });
    // return_url отдаёт фронт виджету, в теле создания платежа его нет.
    expect(request.body).toMatchObject({ confirmation: { type: 'embedded' } });
    expect(
      (request.body as { confirmation: Record<string, unknown> }).confirmation
    ).not.toHaveProperty('return_url');
  });

  it('requests saving the payment method for the first Pro payment', () => {
    const request = buildYooKassaCreatePaymentRequest({
      shopId: '123456',
      secretKey: 'test_secret',
      idempotenceKey: 'payment_order_pro',
      amountRub: 990,
      description: 'Гласно Pro',
      metadata: {
        orderId: 'payment_order_pro',
        userId: 'user_1',
        planId: 'pro_monthly',
      },
      savePaymentMethod: true,
    });

    expect(request.body).toMatchObject({ save_payment_method: true });
  });

  it('builds a recurring charge with the saved YooKassa payment method', () => {
    const request = buildYooKassaRecurringPaymentRequest({
      shopId: '123456',
      secretKey: 'test_secret',
      idempotenceKey: 'renewal_order_1',
      amountRub: 990,
      description: 'Гласно Pro (автопродление)',
      metadata: {
        orderId: 'renewal_order_1',
        userId: 'user_1',
        planId: 'pro_monthly',
      },
      paymentMethodId: 'pm_saved_1',
    });

    expect(request.body).toMatchObject({
      amount: { value: '990.00', currency: 'RUB' },
      capture: true,
      payment_method_id: 'pm_saved_1',
    });
    // Тип сохранённого способа (карта, СБП, SberPay, T-Pay, Alfa Pay)
    // повторно не задаётся: YooKassa определяет его по payment_method_id.
    expect(request.body).not.toHaveProperty('payment_method_data');
    expect(request.body).not.toHaveProperty('confirmation');
  });

  it('extracts succeeded payment event from YooKassa webhook payload', () => {
    const event = extractYooKassaPaymentEvent({
      type: 'notification',
      event: 'payment.succeeded',
      object: {
        id: '2f0f',
        status: 'succeeded',
        paid: true,
        metadata: {
          orderId: 'order_1',
          userId: 'user_1',
          planId: 'pro_monthly',
        },
      },
    });

    expect(event).toEqual({
      event: 'payment.succeeded',
      providerPaymentId: '2f0f',
      status: 'succeeded',
      paid: true,
      orderId: 'order_1',
      userId: 'user_1',
      planId: 'pro_monthly',
    });
  });

  it('extracts cancellation details from the verified YooKassa payment', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'payment_canceled_1',
      status: 'canceled',
      paid: false,
      amount: { value: '990.00', currency: 'RUB' },
      cancellation_details: {
        party: 'payment_network',
        reason: 'insufficient_funds',
      },
    });

    const payment = await getYooKassaPayment(
      { shopId: '123456', secretKey: 'test_secret' },
      'payment_canceled_1'
    );

    expect(payment).toMatchObject({
      cancellationParty: 'payment_network',
      cancellationReason: 'insufficient_funds',
    });
  });

  it('lists payments filtered by creation window with cursor pagination', async () => {
    mockedFetch.mockResolvedValueOnce({
      items: [
        {
          id: 'payment_listed_1',
          status: 'succeeded',
          paid: true,
          amount: { value: '1190.00', currency: 'RUB' },
          metadata: { orderId: 'order_1' },
        },
      ],
      next_cursor: 'cursor_2',
    });

    const page = await yookassaClient.listYooKassaPayments(
      { shopId: '123456', secretKey: 'test_secret' },
      {
        createdAtGte: new Date('2026-07-01T08:00:00.000Z'),
        createdAtLte: new Date('2026-07-01T10:00:00.000Z'),
        cursor: 'cursor_1',
      }
    );

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.yookassa.ru/v3/payments',
      expect.objectContaining({
        method: 'GET',
        query: {
          'created_at.gte': '2026-07-01T08:00:00.000Z',
          'created_at.lte': '2026-07-01T10:00:00.000Z',
          limit: 100,
          cursor: 'cursor_1',
        },
      })
    );
    expect(page).toEqual({
      items: [
        expect.objectContaining({
          id: 'payment_listed_1',
          status: 'succeeded',
          paid: true,
          metadata: { orderId: 'order_1' },
        }),
      ],
      nextCursor: 'cursor_2',
    });
  });
});

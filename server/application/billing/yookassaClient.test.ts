import { describe, expect, it } from 'vitest';
import {
  buildYooKassaCreatePaymentRequest,
  extractYooKassaPaymentEvent,
} from './yookassaClient';

describe('yookassaClient helpers', () => {
  it('builds redirect payment request with idempotence key and metadata', () => {
    const request = buildYooKassaCreatePaymentRequest({
      shopId: '123456',
      secretKey: 'test_secret',
      idempotenceKey: 'payment_order_1',
      amountRub: 990,
      returnUrl: 'https://jobai.test/pricing?payment=return',
      description: 'JobAI Pro',
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
        type: 'redirect',
        return_url: 'https://jobai.test/pricing?payment=return',
      },
      metadata: {
        orderId: 'payment_order_1',
        userId: 'user_1',
        planId: 'pro_monthly',
      },
    });
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
});


import { describe, expect, it } from 'vitest';
import {
  buildYooKassaCreatePaymentRequest,
  buildYooKassaRecurringPaymentRequest,
  extractYooKassaPaymentEvent,
} from './yookassaClient';

describe('yookassaClient helpers', () => {
  it('builds redirect payment request with idempotence key and metadata', () => {
    const request = buildYooKassaCreatePaymentRequest({
      shopId: '123456',
      secretKey: 'test_secret',
      idempotenceKey: 'payment_order_1',
      amountRub: 990,
      returnUrl: 'https://glasno.test/pricing?payment=return',
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
        type: 'redirect',
        return_url: 'https://glasno.test/pricing?payment=return',
      },
      metadata: {
        orderId: 'payment_order_1',
        userId: 'user_1',
        planId: 'pro_monthly',
      },
    });
  });

  it('requests saving the payment method for the first Pro payment', () => {
    const request = buildYooKassaCreatePaymentRequest({
      shopId: '123456',
      secretKey: 'test_secret',
      idempotenceKey: 'payment_order_pro',
      amountRub: 990,
      returnUrl: 'https://glasno.test/pricing?payment=return',
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
});

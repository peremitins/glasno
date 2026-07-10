import { describe, expect, it } from 'vitest';
import {
  BillingCheckoutRequestDto,
  BillingPaymentHistoryResponseDto,
  BillingPaymentStatusResponseDto,
} from './billing';

describe('billing gift DTO', () => {
  it('normalizes the recipient email in gift checkout', () => {
    expect(
      BillingCheckoutRequestDto.parse({
        planId: 'pro_monthly',
        gift: {
          recipientEmail: '  Friend@Example.COM  ',
          senderName: '  Николай  ',
        },
      })
    ).toEqual({
      planId: 'pro_monthly',
      gift: {
        recipientEmail: 'friend@example.com',
        senderName: 'Николай',
      },
    });
  });

  it('requires a non-empty sender name for a gift', () => {
    expect(() =>
      BillingCheckoutRequestDto.parse({
        planId: 'pro_monthly',
        gift: { recipientEmail: 'friend@example.com', senderName: '   ' },
      })
    ).toThrow();

    expect(() =>
      BillingCheckoutRequestDto.parse({
        planId: 'pro_monthly',
        gift: { recipientEmail: 'friend@example.com' },
      })
    ).toThrow();
  });

  it('rejects an invalid recipient email', () => {
    expect(() =>
      BillingCheckoutRequestDto.parse({
        planId: 'pro_monthly',
        gift: { recipientEmail: 'not-an-email', senderName: 'Николай' },
      })
    ).toThrow();
  });

  it('parses gift checkout status independently from purchaser access', () => {
    expect(
      BillingPaymentStatusResponseDto.parse({
        provider: 'yookassa',
        orderId: 'order_1',
        localStatus: 'succeeded',
        providerPaymentId: 'payment_1',
        providerStatus: 'succeeded',
        paid: true,
        providerVerified: true,
        hasActiveSubscription: false,
        subscriptionExpiresAt: null,
        shouldContinuePolling: false,
        purchaseType: 'gift',
        gift: {
          recipientEmailMasked: 'fr***@example.com',
          status: 'ready',
          claimExpiresAt: '2027-01-01T10:00:00.000Z',
          notificationStatus: 'pending',
        },
      }).purchaseType
    ).toBe('gift');
  });

  it('parses cursor-paginated payment history', () => {
    const result = BillingPaymentHistoryResponseDto.parse({
      items: [
        {
          id: 'order_1',
          planId: 'pro_monthly',
          planName: 'Pro',
          planKind: 'subscription',
          amountRub: 990,
          currency: 'RUB',
          provider: 'yookassa',
          status: 'succeeded',
          createdAt: '2026-07-01T10:00:00.000Z',
          operationId: 'payment_1',
          gift: null,
        },
      ],
      nextCursor: 'opaque-cursor',
    });

    expect(result.nextCursor).toBe('opaque-cursor');
  });
});

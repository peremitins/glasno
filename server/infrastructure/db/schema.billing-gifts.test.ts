import { describe, expect, it } from 'vitest';
import { schema } from './client';

describe('billing gift schema', () => {
  it('exposes gift entitlements with activation and notification lifecycle columns', () => {
    expect(schema.giftEntitlements).toBeDefined();
    expect(schema.giftEntitlements.orderId).toBeDefined();
    expect(schema.giftEntitlements.recipientEmail).toBeDefined();
    expect(schema.giftEntitlements.senderName).toBeDefined();
    expect(schema.giftEntitlements.claimExpiresAt).toBeDefined();
    expect(schema.giftEntitlements.notificationStatus).toBeDefined();
  });
});

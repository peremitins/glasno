import { describe, expect, it } from 'vitest';
import { BillingCheckoutRequestDto, isSafeBillingReturnPath } from './billing';

// returnPath в checkout: только внутренний путь приложения. Любая форма,
// способная увести returnUrl на чужой origin, должна отклоняться.
describe('billing checkout returnPath DTO', () => {
  it('accepts internal paths like the interview session page', () => {
    const parsed = BillingCheckoutRequestDto.parse({
      planId: 'realtime_pack_30',
      returnPath: '/interview/3f2b1c9a-6d4e-4f8b-9a21-0c5d7e8f1a2b',
    });
    expect(parsed.returnPath).toBe(
      '/interview/3f2b1c9a-6d4e-4f8b-9a21-0c5d7e8f1a2b'
    );
    expect(isSafeBillingReturnPath('/pricing')).toBe(true);
  });

  it('stays optional for existing clients', () => {
    const parsed = BillingCheckoutRequestDto.parse({ planId: 'pass_30d' });
    expect(parsed.returnPath).toBeUndefined();
  });

  it('rejects anything that could leave our origin or smuggle query params', () => {
    for (const returnPath of [
      '//evil.com',
      'https://evil.com',
      'http://evil.com/pricing',
      '/a?x=1',
      '/a#b',
      '/a\\b',
      'interview/x',
      '/интервью',
      '',
    ]) {
      expect(isSafeBillingReturnPath(returnPath), returnPath).toBe(false);
      expect(
        BillingCheckoutRequestDto.safeParse({
          planId: 'realtime_pack_30',
          returnPath,
        }).success,
        returnPath
      ).toBe(false);
    }
  });
});

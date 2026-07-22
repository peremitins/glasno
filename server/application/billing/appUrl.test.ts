import { describe, expect, it } from 'vitest';
import { PRODUCTION_APP_URL, resolveBillingAppUrl } from './appUrl';

describe('resolveBillingAppUrl', () => {
  it.each([
    undefined,
    '',
    'not-a-url',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://my.glasno.app',
  ])('never returns an unsafe production URL for %s', (value) => {
    expect(resolveBillingAppUrl(value, 'production')).toBe(
      PRODUCTION_APP_URL
    );
  });

  it('keeps the configured HTTPS application host in production', () => {
    expect(
      resolveBillingAppUrl('https://staging.glasno.app/', 'production')
    ).toBe('https://staging.glasno.app');
  });

  it('keeps localhost available for local development', () => {
    expect(resolveBillingAppUrl(undefined, 'development')).toBe(
      'http://localhost:3000'
    );
    expect(
      resolveBillingAppUrl('http://localhost:3100/', 'development')
    ).toBe('http://localhost:3100');
  });
});

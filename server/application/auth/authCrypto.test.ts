import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  hashEmail,
  hashEmailCode,
  normalizeEmail,
  verifyTelegramLoginPayload,
} from './authCrypto';

function signTelegramPayload(
  payload: Record<string, string | number>,
  botToken: string
) {
  const dataCheckString = Object.entries(payload)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  return createHmac('sha256', secret).update(dataCheckString).digest('hex');
}

describe('authCrypto', () => {
  it('normalizes and hashes email without storing raw input as lookup key', () => {
    const normalized = normalizeEmail('  USER+Demo@Example.COM ');

    expect(normalized).toBe('user+demo@example.com');
    expect(hashEmail(normalized, 'pepper')).toHaveLength(64);
    expect(hashEmail(normalized, 'pepper')).toBe(hashEmail(normalized, 'pepper'));
    expect(hashEmail(normalized, 'other-pepper')).not.toBe(
      hashEmail(normalized, 'pepper')
    );
  });

  it('binds email login code hash to normalized email and secret', () => {
    const email = normalizeEmail('User@example.com');

    expect(hashEmailCode(email, '123456', 'secret')).toBe(
      hashEmailCode(email, '123456', 'secret')
    );
    expect(hashEmailCode(email, '000000', 'secret')).not.toBe(
      hashEmailCode(email, '123456', 'secret')
    );
    expect(hashEmailCode('other@example.com', '123456', 'secret')).not.toBe(
      hashEmailCode(email, '123456', 'secret')
    );
  });

  it('verifies Telegram Login Widget signature and rejects tampering', () => {
    const botToken = '123456:test-token';
    const payload = {
      id: 42,
      first_name: 'Ivan',
      username: 'ivan_glasno',
      auth_date: Math.floor(Date.now() / 1000),
    };
    const hash = signTelegramPayload(payload, botToken);

    expect(
      verifyTelegramLoginPayload({ ...payload, hash }, botToken, {
        nowSeconds: payload.auth_date + 30,
        maxAgeSeconds: 60,
      })
    ).toBe(true);

    expect(
      verifyTelegramLoginPayload(
        { ...payload, username: 'attacker', hash },
        botToken,
        { nowSeconds: payload.auth_date + 30, maxAgeSeconds: 60 }
      )
    ).toBe(false);
  });
});

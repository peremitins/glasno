import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeEmailForTrial,
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

describe('canonicalizeEmailForTrial', () => {
  it('collapses plus-addressing into a single trial key', () => {
    // Письма со всеми этими адресами приходят в один ящик, значит и
    // бесплатная попытка должна быть одна.
    expect(canonicalizeEmailForTrial('ivan+1@gmail.com')).toBe(
      'ivan@gmail.com'
    );
    expect(canonicalizeEmailForTrial('ivan+work+2@yandex.ru')).toBe(
      'ivan@yandex.ru'
    );
  });

  it('ignores dots only for gmail', () => {
    expect(canonicalizeEmailForTrial('i.v.a.n@gmail.com')).toBe(
      'ivan@gmail.com'
    );
    expect(canonicalizeEmailForTrial('i.van@googlemail.com')).toBe(
      'ivan@googlemail.com'
    );
    // У Яндекса и mail.ru точки значимы — склеивать нельзя.
    expect(canonicalizeEmailForTrial('i.van@yandex.ru')).toBe(
      'i.van@yandex.ru'
    );
    expect(canonicalizeEmailForTrial('i.van@mail.ru')).toBe('i.van@mail.ru');
  });

  it('normalizes case and whitespace', () => {
    expect(canonicalizeEmailForTrial('  Ivan+Test@GMAIL.com ')).toBe(
      'ivan@gmail.com'
    );
  });

  it('keeps different mailboxes distinct', () => {
    expect(canonicalizeEmailForTrial('ivan@gmail.com')).not.toBe(
      canonicalizeEmailForTrial('petr@gmail.com')
    );
    expect(canonicalizeEmailForTrial('ivan@gmail.com')).not.toBe(
      canonicalizeEmailForTrial('ivan@yandex.ru')
    );
  });

  it('does not produce an empty local part', () => {
    expect(canonicalizeEmailForTrial('+only@gmail.com')).toBe(
      '+only@gmail.com'
    );
    expect(canonicalizeEmailForTrial('...@gmail.com')).toBe('...@gmail.com');
  });

  it('leaves malformed input untouched instead of throwing', () => {
    expect(canonicalizeEmailForTrial('not-an-email')).toBe('not-an-email');
    expect(canonicalizeEmailForTrial('@gmail.com')).toBe('@gmail.com');
  });
});

describe('authCrypto', () => {
  it('does not change the login identity when canonicalizing trials', () => {
    // normalizeEmail определяет аккаунт: если её так же канонизировать,
    // существующие пользователи склеятся между собой.
    expect(normalizeEmail('ivan+1@gmail.com')).toBe('ivan+1@gmail.com');
    expect(normalizeEmail('i.van@gmail.com')).toBe('i.van@gmail.com');
  });

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

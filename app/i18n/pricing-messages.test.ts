import { readFileSync } from 'node:fs';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';

const messages = JSON.parse(
  readFileSync('app/i18n/locales/ru.json', 'utf8')
) as { pricing: { giftEmailPlaceholder: string } };

describe('pricing i18n messages', () => {
  it('compiles the gift email placeholder without treating @ as a linked message', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'ru',
      messages: {
        ru: {
          pricing: {
            giftEmailPlaceholder: messages.pricing.giftEmailPlaceholder,
          },
        },
      },
    });

    expect(i18n.global.t('pricing.giftEmailPlaceholder')).toBe(
      'friend@example.com'
    );
  });
});

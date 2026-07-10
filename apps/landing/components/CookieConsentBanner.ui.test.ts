import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'apps/landing/components/CookieConsentBanner.vue',
  'utf8'
);

describe('CookieConsentBanner', () => {
  it('uses a neutral single-action cookie notice', () => {
    expect(source).toContain('Мы используем cookie для работы сайта');
    expect(source).toContain('Принять');
    expect(source).not.toContain('Яндекс.Метрики');
    expect(source).not.toContain('Разрешить аналитику');
    expect(source).not.toContain('Только обязательные');
    expect(source).not.toContain('Настройки cookie');
    expect(source).not.toContain('cookie-settings');
    expect(source).not.toContain('mc.yandex.ru');
    expect(source).not.toContain('initializeMetrika');
  });
});

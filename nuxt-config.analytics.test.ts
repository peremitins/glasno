import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('nuxt.config.ts', 'utf8');

describe('application analytics config', () => {
  it('uses the shared Yandex Metrika counter with Webvisor enabled', () => {
    expect(source).toContain("'nuxt-yandex-metrika'");
    expect(source).toContain('yandexMetrika:');
    expect(source).toContain('NUXT_PUBLIC_YANDEX_METRIKA_ID');
    expect(source).toContain('webvisor: true');
    expect(source).toContain('clickmap: true');
    expect(source).toContain('trackLinks: true');
  });
});

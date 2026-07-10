import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('apps/landing/nuxt.config.ts', 'utf8');

describe('landing analytics config', () => {
  it('loads Yandex Metrika through the Nuxt module with Webvisor enabled', () => {
    expect(source).toContain("modules: ['nuxt-yandex-metrika']");
    expect(source).toContain('yandexMetrika:');
    expect(source).toContain('NUXT_PUBLIC_YANDEX_METRIKA_ID');
    expect(source).toContain('webvisor: true');
    expect(source).toContain('clickmap: true');
    expect(source).toContain('trackLinks: true');
  });
});

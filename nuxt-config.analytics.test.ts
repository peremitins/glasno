import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('nuxt.config.ts', 'utf8');
const metrikaPluginSource = readFileSync(
  'app/plugins/yandexMetrika.client.ts',
  'utf8',
);

describe('application analytics config', () => {
  it('does not use the SSR-oriented Metrika module in the client-only application', () => {
    expect(source).not.toContain('nuxt-yandex-metrika');
    expect(source).not.toContain('yandexMetrika:');
    expect(existsSync('app/plugins/yandexMetrika.client.ts')).toBe(true);
  });

  it('creates a callable Metrika queue before init and SPA hits', () => {
    expect(metrikaPluginSource).toContain("typeof window.ym === 'function'");
    expect(metrikaPluginSource).toContain("ym(COUNTER_ID, 'init'");
    expect(metrikaPluginSource).toContain("ym(COUNTER_ID, 'hit'");
    expect(metrikaPluginSource).toContain("script.src = 'https://mc.yandex.ru/metrika/tag.js'");
  });
});

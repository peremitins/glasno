import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicRoots = ['public', 'apps/landing/public'];

const requiredAssetPaths = [
  'brand/logo.webp',
  'brand/logo.png',
  'favicon.ico',
  'favicon.svg',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'favicon-48x48.png',
  'favicon-96x96.png',
  'apple-touch-icon.png',
  'apple-touch-icon-120x120.png',
  'apple-touch-icon-152x152.png',
  'apple-touch-icon-167x167.png',
  'apple-touch-icon-180x180.png',
  'apple-touch-icon-precomposed.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'maskable-icon-192x192.png',
  'maskable-icon-512x512.png',
  'mstile-70x70.png',
  'mstile-144x144.png',
  'mstile-150x150.png',
  'mstile-310x150.png',
  'mstile-310x310.png',
  'site.webmanifest',
  'browserconfig.xml',
];

describe('brand assets', () => {
  it.each(publicRoots)('ships the complete favicon set in %s', (root) => {
    for (const assetPath of requiredAssetPaths) {
      expect(existsSync(join(root, assetPath)), assetPath).toBe(true);
    }
  });

  it.each(publicRoots)('registers install icons in %s manifest', (root) => {
    const manifest = JSON.parse(
      readFileSync(join(root, 'site.webmanifest'), 'utf8')
    ) as {
      icons: Array<{ src: string; purpose?: string; sizes: string }>;
    };

    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/android-chrome-192x192.png' }),
        expect.objectContaining({ src: '/android-chrome-512x512.png' }),
        expect.objectContaining({
          src: '/maskable-icon-192x192.png',
          purpose: 'maskable',
        }),
        expect.objectContaining({
          src: '/maskable-icon-512x512.png',
          purpose: 'maskable',
        }),
      ])
    );
  });

  it('uses the logo asset in app and landing brand surfaces', () => {
    const sources = [
      'app/layouts/default.vue',
      'app/pages/auth.vue',
      'apps/landing/components/landing/TheHeader.vue',
      'apps/landing/components/landing/TheFooter.vue',
    ].map((path) => readFileSync(path, 'utf8'));

    for (const source of sources) {
      expect(source).toContain('src="/brand/logo.webp"');
    }
  });
});

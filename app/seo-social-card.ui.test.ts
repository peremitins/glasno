import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('nuxt.config.ts', 'utf8');

describe('social card for the SPA shell', () => {
  it('puts complete Open Graph and Twitter metadata into the initial HTML', () => {
    expect(source).toMatch(/const socialImageUrl = .*og-cover\.jpg/);

    for (const tag of [
      "{ property: 'og:title', content: socialTitle }",
      "{ property: 'og:description', content: socialDescription }",
      "{ property: 'og:type', content: 'website' }",
      "{ property: 'og:image', content: socialImageUrl }",
      "{ property: 'og:image:width', content: '1420' }",
      "{ property: 'og:image:height', content: '797' }",
      "{ property: 'og:image:type', content: 'image/jpeg' }",
      "{ name: 'twitter:card', content: 'summary_large_image' }",
      "{ name: 'twitter:image', content: socialImageUrl }",
    ]) {
      expect(source).toContain(tag);
    }
  });

  it('does not pin every SPA route to the root URL in og:url', () => {
    expect(source).not.toContain("property: 'og:url'");
  });
});

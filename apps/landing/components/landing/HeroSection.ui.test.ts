import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'apps/landing/components/landing/HeroSection.vue',
  'utf8'
);

describe('HeroSection', () => {
  it('keeps actions and the free-interview note in one CTA group', () => {
    expect(source).toContain('class="hero__cta"');
    expect(source).toMatch(
      /class="hero__cta"[\s\S]*class="hero__actions"[\s\S]*class="hero__note"/
    );
    expect(source).toMatch(/\.hero__cta\s*{[^}]*gap:\s*24px;/);
    expect(source).toMatch(/\.hero__actions\s*{[^}]*gap:\s*14px;/);
    expect(source).not.toMatch(/\.hero__note\s*{[^}]*margin-top:/);
  });

  it('keeps the secondary action connected to the how-it-works section', () => {
    expect(source).toContain("scrollTo('#how', -70)");
    expect(source).toContain('type="button"');
  });
});

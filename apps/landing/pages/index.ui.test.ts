import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../composables/useLandingContent';

const source = readFileSync('apps/landing/pages/index.vue', 'utf8');

describe('landing page structure', () => {
  it('removes the redundant trust section while retaining legal content elsewhere', () => {
    expect(source).not.toContain('<TrustSection');
    expect(
      existsSync('apps/landing/components/landing/TrustSection.vue')
    ).toBe(false);
    expect(useLandingContent()).not.toHaveProperty('trust');
  });
});

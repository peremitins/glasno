import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/components/design/GlassSkeletonStack.vue', 'utf8');

describe('GlassSkeletonStack', () => {
  it('uses only a soft pulse without horizontal shimmer', () => {
    expect(source).toContain('glass-skeleton-pulse');
    expect(source).toContain('opacity: 0;');
    expect(source).toContain('opacity: 1;');
    expect(source).not.toContain('.glass-skeleton-block::after');
    expect(source).not.toContain('glass-skeleton-sheen');
    expect(source).not.toContain('translateX');
    expect(source).not.toContain('--glass-sheen');
  });
});

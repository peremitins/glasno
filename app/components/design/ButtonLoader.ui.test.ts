import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/components/design/ButtonLoader.vue', 'utf8');

describe('ButtonLoader', () => {
  it('centers a CSS spinner over button content without changing button width', () => {
    expect(source).toContain('class="button-loader"');
    expect(source).toContain('pointer-events: none;');
    expect(source).toContain('position: absolute;');
    expect(source).toContain('inset: 0;');
    expect(source).toContain('button-loader-spin');
    expect(source).not.toContain('~icons/');
  });
});

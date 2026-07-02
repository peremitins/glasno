import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/index.vue', 'utf8');

describe('dashboard page UI structure', () => {
  it('keeps active session context inside the main preparation panel', () => {
    expect(source).toContain('active-inline');
    expect(source).not.toContain('active-card');
    expect(source).not.toContain('signal-pulse');
  });
});

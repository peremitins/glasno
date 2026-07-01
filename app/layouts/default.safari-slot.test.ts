import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultLayoutPath = resolve(currentDir, 'default.vue');

describe('default layout Safari slot rendering', () => {
  it('does not render page content through a direct slot outlet', () => {
    const source = readFileSync(defaultLayoutPath, 'utf8');

    expect(source).not.toContain('<slot />');
    expect(source).toContain('<SlotOutlet />');
  });
});

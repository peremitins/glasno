import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('app/components/VoiceInput.vue', 'utf8');

describe('VoiceInput', () => {
  it('останавливает диктовку, когда поле блокируется во время отправки', () => {
    expect(source).toMatch(/watch\(\s*\(\) => props\.disabled/);
    expect(source).toContain('void dictation.stop()');
  });
});

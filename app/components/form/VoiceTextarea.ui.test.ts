import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('app/components/form/VoiceTextarea.vue', 'utf8');

describe('VoiceTextarea UI actions', () => {
  it('exposes a clear action for non-empty textareas', () => {
    expect(source).toContain('clearValue');
    expect(source).toContain('voice-textarea__clear');
    expect(source).toContain('voice.textarea.clear');
  });
});

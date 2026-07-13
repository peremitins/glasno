import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'app/components/interview/LocalCameraPreview.vue',
  'utf8'
);

describe('LocalCameraPreview profile avatar fallback', () => {
  it('shows a supplied avatar only while the local camera is inactive', () => {
    expect(source).toContain('avatarUrl?: string | null');
    expect(source).toContain('const avatarFailed = ref(false)');
    expect(source).toContain('v-if="!isActive && avatarUrl && !avatarFailed"');
    expect(source).toContain('@error="avatarFailed = true"');
    expect(source).toContain('v-else-if="!isActive"');
  });
});

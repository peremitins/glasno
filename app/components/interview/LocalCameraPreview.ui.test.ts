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

  it('fits an inactive profile photo across the participant tile and keeps the camera status visible', () => {
    expect(source).toContain('class="placeholder placeholder--avatar"');
    expect(source).toContain('class="avatar-photo"');
    expect(source).toMatch(/\.avatar-photo \{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?object-fit: contain;/);
    expect(source).toMatch(
      /\.placeholder--avatar \.placeholder-text \{[\s\S]*?position: absolute;[\s\S]*?right: 12px;[\s\S]*?bottom: 12px;[\s\S]*?z-index: 1;/
    );
  });
});

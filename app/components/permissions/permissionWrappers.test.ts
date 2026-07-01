import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wrapperFiles = [
  'app/components/mic/MicPermissionDeniedDialog.vue',
  'app/components/camera/CameraPermissionDeniedDialog.vue',
  'app/components/audio/AudioPermissionDeniedDialog.vue',
];

describe('permission wrapper SFCs', () => {
  it('keep a real style block so stale Vite style requests do not receive script content', () => {
    for (const file of wrapperFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('<style scoped>');
    }
  });
});

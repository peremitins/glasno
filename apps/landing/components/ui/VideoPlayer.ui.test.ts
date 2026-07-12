import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'apps/landing/components/ui/VideoPlayer.vue',
  'utf8'
);

describe('VideoPlayer', () => {
  it('plays a muted loop only while its section is visible', () => {
    expect(source).toContain('IntersectionObserver');
    expect(source).toContain('await video.play()');
    expect(source).toContain('videoEl.value?.pause()');
    expect(source).toMatch(/\bloop\b/);
    expect(source).toMatch(/\bplaysinline\b/);
    expect(source).toContain('preload="none"');
  });

  it('offers only the sound toggle, not playback controls', () => {
    expect(source).toContain('aria-label="muted ? \'Включить звук\' : \'Выключить звук\'"');
    expect(source).not.toContain('aria-label="playing ? \'Пауза\' : \'Играть\'"');
    expect(source).not.toContain('@click="togglePlay"');
  });

  it('can hide the sound toggle for silent demonstration videos', () => {
    expect(source).toContain('showSoundControl?: boolean');
    expect(source).toContain('showSoundControl: true');
    expect(source).toContain('v-if="hasVideo && started && showSoundControl"');
  });
});

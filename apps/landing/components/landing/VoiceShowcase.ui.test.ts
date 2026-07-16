import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../../composables/useLandingContent';

const source = readFileSync(
  'apps/landing/components/landing/VoiceShowcase.vue',
  'utf8'
);

describe('VoiceShowcase', () => {
  it('uses the prepared voice interview video with its original aspect ratio', () => {
    const { voice } = useLandingContent();

    expect(voice.videoSrc).toBe('/videos/interview-voice-demo.mp4');
    expect(
      existsSync('apps/landing/public/videos/interview-voice-demo.mp4')
    ).toBe(true);
    expect(source).toContain(':src="voice.videoSrc"');
    expect(source).toContain(':sound-hint="voice.soundOnHint"');
    expect(source).toContain('aspect="2000 / 1080"');
  });
});

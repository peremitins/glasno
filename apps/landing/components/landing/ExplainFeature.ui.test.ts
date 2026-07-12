import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../../composables/useLandingContent';

const source = readFileSync(
  'apps/landing/components/landing/ExplainFeature.vue',
  'utf8'
);

describe('ExplainFeature', () => {
  it('uses the prepared selection-explanation video instead of the mock', () => {
    const { explain } = useLandingContent();

    expect(explain.videoSrc).toBe('/videos/interview-explain-selection.mp4');
    expect(source).toContain(':src="explain.videoSrc"');
    expect(source).toContain(':show-sound-control="false"');
  });

  it('uses the source video aspect ratio without cropping its sides', () => {
    expect(source).toContain('aspect="2076 / 1080"');
  });

  it('does not let the mobile grid grow wider than a narrow viewport', () => {
    expect(source).toMatch(
      /@media \(max-width: 899px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/
    );
    expect(source).toMatch(/\.xpl__(?:copy|stage)[\s\S]*?min-width:\s*0;/);
  });
});

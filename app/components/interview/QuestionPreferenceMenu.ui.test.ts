import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const menuSource = readFileSync(
  'app/components/interview/QuestionPreferenceMenu.vue',
  'utf8'
);
const interviewSource = readFileSync('app/pages/interview/[id].vue', 'utf8');

describe('QuestionPreferenceMenu', () => {
  it('renders above the fullscreen interview layer', () => {
    const fullscreenLayer = interviewSource.match(
      /\.call--fs\s*\{[\s\S]*?z-index:\s*(\d+)/
    );
    const menuLayer = menuSource.match(
      /\.question-preference-menu\s*\{[\s\S]*?z-index:\s*(\d+)/
    );

    expect(fullscreenLayer?.[1]).toBeDefined();
    expect(menuLayer?.[1]).toBeDefined();
    expect(Number(menuLayer?.[1])).toBeGreaterThan(Number(fullscreenLayer?.[1]));
  });

  it('uses an opaque surface because the menu is teleported over the interview', () => {
    const menuStyle = menuSource.match(
      /\.question-preference-menu\s*\{([\s\S]*?)\n {2}\}/
    )?.[1];

    expect(menuStyle).toContain('background: var(--surface-solid)');
  });
});

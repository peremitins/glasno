import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/components/realtime/RealtimeVoicePanel.vue', 'utf8');

describe('RealtimeVoicePanel UI', () => {
  it('renders the compact realtime control as a visible responsive CTA', () => {
    const narrowCss = source.slice(
      source.indexOf('@media (max-width: 380px)'),
      source.indexOf('.realtime-panel')
    );

    expect(source).toContain('rt-icon-label');
    expect(source).toContain('voice.realtime.startShort');
    expect(source).toContain('rt-icon-live');
    expect(source).toContain('@media (max-width: 380px)');
    expect(narrowCss).toContain('.rt-icon-live');
    expect(narrowCss).toContain('display: none');
    expect(narrowCss).not.toContain('.rt-icon-label');
    expect(narrowCss).not.toContain('.rt-icon-mark');
  });

  it('restarts an active realtime session after gender or tone changes', () => {
    expect(source).toMatch(
      /watch\(\s*\(\) => props\.voiceProfileKey,[\s\S]*?realtimeVoice\.restart\(\)/
    );
  });
});

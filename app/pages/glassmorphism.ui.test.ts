import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styledContentFiles = [
  'app/pages/history.vue',
  'app/pages/questions.vue',
  'app/pages/questions/[slug].vue',
  'app/pages/pricing.vue',
  'app/pages/profile.vue',
  'app/pages/interview/[id].vue',
  'app/pages/interview/report/[id].vue',
  'app/components/VoiceInput.vue',
  'app/components/realtime/RealtimeVoicePanel.vue',
  'app/components/permissions/BrowserPermissionDialog.vue',
];

describe('glassmorphism visual system', () => {
  it('keeps content pages on the shared glass surface tokens', () => {
    for (const file of styledContentFiles) {
      const source = readFileSync(file, 'utf8');

      expect(source, file).not.toMatch(/background:\s*var\(--color-surface\)/);
      expect(source, file).not.toMatch(
        /border:\s*1px\s+solid\s+var\(--color-border\)/
      );
    }
  });

  it('uses mono as the default app font and first selectable font', () => {
    const preferences = readFileSync(
      'app/composables/useDesignPreferences.ts',
      'utf8'
    );

    expect(preferences).toContain(
      "const font = useState<JobaiFont>('jobai-font', () => 'mono')"
    );
    expect(preferences.indexOf("{ value: 'mono'")).toBeLessThan(
      preferences.indexOf("{ value: 'manrope'")
    );
  });
});

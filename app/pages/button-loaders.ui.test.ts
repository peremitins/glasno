import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const buttonLoaderSources = [
  'app/pages/auth.vue',
  'app/pages/profile.vue',
  'app/pages/pricing.vue',
  'app/pages/history.vue',
  'app/pages/interview/new.vue',
  'app/pages/interview/[id].vue',
  'app/components/interview/ReportGenerationPanel.vue',
  'app/components/realtime/RealtimeVoicePanel.vue',
];

describe('async button loaders', () => {
  it.each(buttonLoaderSources)('%s uses the shared ButtonLoader pattern', (path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).toContain(
      "import ButtonLoader from '@/app/components/design/ButtonLoader.vue'"
    );
    expect(source).toContain('<ButtonLoader v-if=');
    expect(source).toContain('button-loader-host');
    expect(source).toContain('button-loader-content--loading');
  });

  it('keeps local auth button state resettable after failed requests', () => {
    const authSource = readFileSync('app/pages/auth.vue', 'utf8');
    const profileSource = readFileSync('app/pages/profile.vue', 'utf8');

    expect(authSource).toContain('authAction');
    expect(authSource).toContain('authAction.value = null;');
    expect(profileSource).toContain('profileAuthAction');
    expect(profileSource).toContain('profileAuthAction.value = null;');
  });

  it('wires report retry loading state into the report generation panel', () => {
    const source = readFileSync('app/pages/interview/report/[id].vue', 'utf8');

    expect(source).toContain('isRetryingReport');
    expect(source).toContain(':retry-loading="isRetryingReport"');
    expect(source).toContain('isRetryingReport.value = false;');
  });
});

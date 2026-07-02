import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pagePaths = [
  'app/pages/index.vue',
  'app/pages/history.vue',
  'app/pages/questions.vue',
  'app/pages/questions/[slug].vue',
  'app/pages/pricing.vue',
  'app/pages/profile.vue',
  'app/pages/interview/[id].vue',
  'app/pages/interview/report/[id].vue',
];

describe('page data loading skeletons', () => {
  it.each(pagePaths)('%s renders initial API loading through GlassSkeletonStack', (path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).toContain(
      "import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue'"
    );
    expect(source).toContain('useLazyAsyncData');
    expect(source).toContain('GlassSkeletonStack');
  });

  it('does not use text-only common loading indicators on data pages', () => {
    for (const path of pagePaths) {
      const source = readFileSync(path, 'utf8');

      expect(source).not.toContain("{{ t('common.loading') }}");
      expect(source).not.toContain('{{ pending ? t(');
    }
  });
});

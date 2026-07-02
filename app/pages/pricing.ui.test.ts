import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/pricing.vue', 'utf8');

describe('pricing page loading state', () => {
  it('renders tariff skeletons while billing plans are loading lazily', () => {
    expect(source).toContain('useLazyAsyncData');
    expect(source).toContain('plansPending');
    expect(source).toContain('statusPending');
    expect(source).toContain('statusInitialPending');
    expect(source).toContain('plansInitialPending');
    expect(source).toContain(
      "import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue'"
    );
    expect(source).toContain('GlassSkeletonStack');
    expect(source).toContain('status-skeleton');
    expect(source).toContain('plans-skeleton');
    expect(source).toContain('v-if="statusInitialPending"');
    expect(source).toContain('v-if="plansInitialPending || statusInitialPending"');
    expect(source).toMatch(
      /:disabled="\s*Boolean\(checkoutPlanId\)\s*\|\|\s*statusPending\s*\|\|\s*status\?\.needsAuthForCheckout\s*"/
    );
    expect(source).not.toContain(
      '<p v-if="plansPending" class="muted">{{ t(\'common.loading\') }}</p>'
    );
  });
});

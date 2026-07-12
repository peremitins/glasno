import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/profile.vue', 'utf8');

describe('profile page loading state', () => {
  it('renders a glass skeleton while billing status is loading lazily', () => {
    expect(source).toContain(
      "import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue'"
    );
    expect(source).toContain('useLazyAsyncData');
    expect(source).toContain('pending: billingPending');
    expect(source).toContain('profileBillingInitialPending');
    expect(source).toContain('billingPending.value && !billingStatus.value');
    expect(source).toContain('GlassSkeletonStack');
    expect(source).toContain('profile-skeleton');
    expect(source).toContain('v-if="auth.isAuthenticated && profileBillingInitialPending"');
  });

  it('shows access while the free interview is still available', () => {
    expect(source).toContain('billingStatus?.canCreateInterview');
  });

  it('keeps the Telegram identity row hidden without removing it', () => {
    expect(source).toContain('const showTelegramIdentity = false');
    expect(source).toContain('v-if="showTelegramIdentity"');
  });
});

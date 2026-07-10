import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/pricing.vue', 'utf8');
const messages = JSON.parse(
  readFileSync('app/i18n/locales/ru.json', 'utf8')
) as {
  pricing: {
    minutePacksSubtitle: string;
    packsNeedPlan: string;
    autoRenewDisclosure: string;
  };
  paywall: { minutesDescription: string };
};

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

describe('pricing plan affordances', () => {
  it('renders feature lists with Radix checkmarks and accent tokens', () => {
    expect(source).toContain(
      "import { CheckIcon } from '@radix-icons/vue'"
    );
    expect(source).toMatch(
      /<li v-for="feature in plan\.features"[^>]*>\s*<CheckIcon class="feature-check"/
    );
    expect(source).toMatch(
      /<li v-for="feature in pack\.features"[^>]*>\s*<CheckIcon class="feature-check"/
    );
    expect(source).toMatch(/\.features li\s*{[^}]*display:\s*flex;/s);
    expect(source).toMatch(
      /\.feature-check\s*{[^}]*color:\s*var\(--accent\);/s
    );
    expect(source).not.toContain('.features li::marker');
  });

  it('locks minute packs using the server permission flag', () => {
    expect(source).toMatch(
      /const packsLocked = computed\(\s*\(\) =>\s*!\(\s*status\.value\?\.realtimeVoice\.canBuyMore\s*\|\|\s*status\.value\?\.unlimited\s*\)\s*\);/
    );
  });

  it('shows the renewal disclosure under the monthly checkout CTA', () => {
    expect(source).toMatch(
      /v-if="plan\.interval === 'month' && plan\.isCheckoutEnabled"\s*class="plan-note"/
    );
    expect(source).toContain("t('pricing.autoRenewDisclosure'");
    expect(messages.pricing.autoRenewDisclosure).toBe(
      'Автопродление: спишем {amount} ₽ через месяц. Отмена в один клик.'
    );
  });

  it('describes minute packs as additions to either active paid plan', () => {
    expect(messages.pricing.minutePacksSubtitle).toContain(
      'Докупаются к Pro и Разовой подготовке'
    );
    expect(messages.pricing.packsNeedPlan).toContain(
      'к активному платному тарифу'
    );
    expect(messages.paywall.minutesDescription).toContain(
      'к активному платному тарифу'
    );
  });
});

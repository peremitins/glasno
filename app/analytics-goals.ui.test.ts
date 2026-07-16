import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const metrikaHelperPath = 'shared/analytics/yandexMetrika.ts';
const metrikaHelper = existsSync(metrikaHelperPath)
  ? read(metrikaHelperPath)
  : '';

describe('Yandex Metrika business goals', () => {
  it('defines exactly the six configured goal identifiers in one shared helper', () => {
    expect(metrikaHelper).toContain("landingAppOpen: 'landing_app_open'");
    expect(metrikaHelper).toContain("authCompleted: 'auth_completed'");
    expect(metrikaHelper).toContain("checkoutCreated: 'checkout_created'");
    expect(metrikaHelper).toContain("passPaid: 'pass_paid'");
    expect(metrikaHelper).toContain("minutePackPaid: 'minute_pack_paid'");
    expect(metrikaHelper).toContain("interviewStarted: 'interview_started'");
    expect(metrikaHelper).toContain("'reachGoal'");
  });

  it('tracks every landing entry point into the application', () => {
    for (const path of [
      'apps/landing/components/landing/HeroSection.vue',
      'apps/landing/components/landing/PricingSection.vue',
      'apps/landing/components/landing/FinalCta.vue',
      'apps/landing/components/landing/TheHeader.vue',
    ]) {
      expect(read(path), path).toContain('YandexMetrikaGoal.landingAppOpen');
    }
  });

  it('tracks completed authentication and every successful interview creation', () => {
    expect(read('app/stores/auth.ts')).toContain(
      'YandexMetrikaGoal.authCompleted'
    );
    expect(read('app/pages/index.vue')).toContain(
      'YandexMetrikaGoal.interviewStarted'
    );
    expect(read('app/pages/interview/new.vue')).toContain(
      'YandexMetrikaGoal.interviewStarted'
    );
  });

  it('tracks checkout creation from pricing and paywall, then tracks a confirmed paid plan once', () => {
    const pricing = read('app/pages/pricing.vue');
    expect(pricing).toContain('YandexMetrikaGoal.checkoutCreated');
    expect(read('app/components/billing/PaywallModal.vue')).toContain(
      'YandexMetrikaGoal.checkoutCreated'
    );
    expect(pricing).toContain('trackPaidMetrikaGoal');
    expect(read('shared/dto/billing.ts')).toContain('conversion: z');

    const reconciliation = pricing.slice(
      pricing.indexOf('async function reconcileReturnedPayment'),
      pricing.indexOf('onMounted(() =>')
    );
    expect(reconciliation.indexOf('trackPaidMetrikaGoal')).toBeLessThan(
      reconciliation.indexOf('await refreshStatus()')
    );
  });
});

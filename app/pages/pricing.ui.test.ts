import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/pricing.vue', 'utf8');
const checkoutModalSource = readFileSync(
  'app/components/billing/BillingCheckoutModal.vue',
  'utf8'
);
const layoutSource = readFileSync('app/layouts/default.vue', 'utf8');
const authSource = readFileSync('app/pages/auth.vue', 'utf8');
const globalStyles = readFileSync('app/assets/css/main.css', 'utf8');
const paymentHistorySource = readFileSync(
  'app/components/billing/PaymentHistory.vue',
  'utf8'
);
const messages = JSON.parse(
  readFileSync('app/i18n/locales/ru.json', 'utf8')
) as {
  pricing: {
    minutePacksSubtitle: string;
    packsNeedPlan: string;
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
    expect(source).toContain(
      'v-if="plansInitialPending || statusInitialPending"'
    );
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
    expect(source).toContain("import { CheckIcon } from '@radix-icons/vue'");
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

describe('pricing subscription management and gift checkout', () => {
  it('opens a focused checkout modal with a persistent gift mode and recipient email', () => {
    expect(source).toContain('selectedPlanId');
    expect(source).toContain('giftMode');
    expect(source).toContain('recipientEmail');
    expect(source).toContain("gift: giftMode.value");
    expect(source).toContain('BillingCheckoutModal');
    expect(source).not.toContain('id="billing-checkout"');
    expect(source).not.toContain('checkout-shell');
    expect(checkoutModalSource).toContain('role="dialog"');
    expect(checkoutModalSource).toContain('type="email"');
    expect(checkoutModalSource).toContain('senderName');
    expect(checkoutModalSource).toContain("t('pricing.giftSenderNameLabel')");
    expect(checkoutModalSource.match(/class="input-shell"/g)).toHaveLength(2);
    expect(authSource).toContain('class="input-shell"');
    expect(globalStyles).toMatch(
      /\.input-shell input[^}]*min-height:\s*54px;[^}]*padding:\s*0 16px;/s
    );
    expect(checkoutModalSource).not.toContain('chooseAnotherPlan');
  });

  it('removes redundant management actions and supports sidebar gift deep links', () => {
    expect(source).not.toContain('management-actions');
    expect(source).not.toContain('scrollToPlans');
    expect(source).not.toContain('plansSection');
    expect(layoutSource).toContain('/pricing?checkout=gift&plan=pro_monthly');
    expect(layoutSource).toContain("t('layout.giftAction')");
    expect(layoutSource).toContain("t('layout.shareAction')");
    expect(layoutSource).toContain('shareServiceContent');
    const sidebarNav = layoutSource.match(
      /<nav class="nav"[\s\S]*?<\/nav>/
    )?.[0];
    expect(sidebarNav).toBeDefined();
    expect(sidebarNav).not.toContain('sidebar-quick-actions');
    expect(sidebarNav).not.toContain('sidebar-action--gift');
    expect(sidebarNav!.indexOf("t(`nav.${item.key}`)")).toBeLessThan(
      sidebarNav!.indexOf("t('layout.giftAction')")
    );
    expect(sidebarNav!.indexOf("t('layout.giftAction')")).toBeLessThan(
      sidebarNav!.indexOf("t('layout.shareAction')")
    );
    expect(sidebarNav!.indexOf("t('layout.shareAction')")).toBeLessThan(
      sidebarNav!.indexOf("t('nav.profile')")
    );
  });

  it('renders paginated payment history after plans and minute packs', () => {
    expect(source).toContain('PaymentHistory');
    expect(source).toContain('paymentHistoryRef');
    expect(paymentHistorySource).toContain('/api/billing/payments');
    expect(paymentHistorySource).toContain('nextCursor');
    expect(paymentHistorySource).toContain("t('pricing.historyLoadMore')");
    expect(paymentHistorySource).toContain('GlassSkeletonStack');
  });
});

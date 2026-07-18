import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/pricing.vue', 'utf8');
const checkoutModalSource = readFileSync(
  'app/components/billing/BillingCheckoutModal.vue',
  'utf8'
);
const paywallModalSource = readFileSync(
  'app/components/billing/PaywallModal.vue',
  'utf8'
);
const yookassaWidgetSource = readFileSync(
  'app/composables/useYookassaWidget.ts',
  'utf8'
);
const realtimeVoicePanelSource = readFileSync(
  'app/components/realtime/RealtimeVoicePanel.vue',
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

describe('pricing pass card (тарифы v2)', () => {
  it('renders a single full-access card with a six-step duration picker', () => {
    expect(source).toContain("t('pricing.fullAccessTitle')");
    expect(source).toContain('duration-picker');
    expect(source).toContain('role="radiogroup"');
    expect(source).toMatch(/v-for="plan in passPlans"/);
    expect(source).toContain('selectedPassId = plan.id');
    expect(source).toContain("t('pricing.perDay'");
    // Старой сетки из трёх карточек больше нет.
    expect(source).not.toContain('mainPlans');
    expect(source).not.toContain('single_prep');
    expect(source).not.toContain('pro_monthly');
  });

  it('renders feature lists with Radix checkmarks and accent tokens', () => {
    expect(source).toContain("import { CheckIcon } from '@radix-icons/vue'");
    expect(source).toMatch(
      /<li v-for="feature in selectedPass\.features"[^>]*>\s*<CheckIcon class="feature-check"/
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

  it('describes minute packs as additions to the active pass', () => {
    expect(messages.pricing.minutePacksSubtitle).toContain(
      'к активному пропуску'
    );
    expect(messages.pricing.packsNeedPlan).toContain('к активному пропуску');
    expect(messages.paywall.minutesDescription).toContain(
      'к активному пропуску'
    );
  });

  it('places the minute-pack heading in the standard glass container', () => {
    expect(source).toContain(
      '<header class="packs-header glass-frame glass-frame--soft">'
    );
  });

  it('shows all four current-access states', () => {
    for (const state of ['admin', 'active', 'expired', 'trial-used']) {
      expect(source).toContain(`'${state}'`);
    }
    expect(source).toContain("t('pricing.accessExpiredAt'");
    expect(source).toContain("t('pricing.trialHint')");
    expect(source).toContain("t('pricing.trialUsedHint')");
  });
});

describe('pricing auto-renewal consent (default-on)', () => {
  it('opens checkout with auto-renewal enabled by default and sends the choice', () => {
    expect(source).toContain('const autoRenew = ref(true)');
    expect(source).toContain('autoRenew.value = true');
    expect(source).toContain('autoRenew: !isGift && autoRenew.value');
    expect(source).toContain(':auto-renew="autoRenew"');
  });

  it('renders an explicit auto-renew switch with charge date and amount in the modal', () => {
    expect(checkoutModalSource).toContain("t('pricing.autoRenewSwitchLabel')");
    expect(checkoutModalSource).toContain("t('pricing.autoRenewSwitchHint'");
    expect(checkoutModalSource).toContain('updateAutoRenew');
    expect(checkoutModalSource).toContain('nextChargeDate');
    // Подарок — всегда без автопродления: свитч скрывается.
    expect(checkoutModalSource).toMatch(
      /renewalAvailable = computed\(\s*\(\) => props\.plan\?\.type === 'pass' && !displayGift\.value\s*\)/
    );
  });
});

describe('YooKassa widget presentation', () => {
  it('opens the native YooKassa modal instead of nesting the widget in checkout chrome', () => {
    expect(yookassaWidgetSource).toContain('modal: true');
    expect(yookassaWidgetSource).toContain('getYooKassaWidgetColors');
    expect(yookassaWidgetSource).toContain("control_primary: '#7C5CFF'");
    expect(yookassaWidgetSource).toContain(
      "control_primary_content: '#FFFFFF'"
    );
    expect(yookassaWidgetSource).toContain("background: '#11162C'");
    expect(yookassaWidgetSource).toContain("background: '#F4F7FF'");
    expect(yookassaWidgetSource).toContain('colors: getYooKassaWidgetColors()');
    // Не фиксируем СБП отдельно: на мобильном сам виджет отобразит список
    // банков и платежных сервисов после выбора СБП.
    expect(yookassaWidgetSource).not.toContain('payment_methods:');
    expect(yookassaWidgetSource).toContain("instance.on('modal_close'");
    expect(yookassaWidgetSource).toContain('await instance.render();');
    expect(checkoutModalSource).toContain('v-if="shellVisible && plan"');
    expect(checkoutModalSource).not.toContain('ref="widgetContainer"');
    expect(checkoutModalSource).toContain('modal: true');
    expect(checkoutModalSource).toContain("onModalClose: () => emit('back')");
  });

  it('returns to the paywall choices when the native YooKassa modal closes', () => {
    expect(paywallModalSource).toContain('v-if="overlayVisible"');
    expect(paywallModalSource).not.toContain('ref="widgetContainer"');
    expect(paywallModalSource).toContain('modal: true');
    expect(paywallModalSource).toContain('onModalClose: resetWidget');
  });

  it('keeps its own overlay (loader/error) until the YooKassa modal is open', () => {
    // Загрузка скрипта виджета ограничена таймаутом, при сбое тег и промис
    // сбрасываются — «Повторить» вставляет свежий <script>.
    expect(yookassaWidgetSource).toContain('SCRIPT_LOAD_TIMEOUT_MS');
    expect(yookassaWidgetSource).toContain('scriptPromise = null');
    expect(yookassaWidgetSource).toContain('script.remove()');

    // Оверлеи обеих модалок видны, пока окно YooKassa не открыто, и
    // scroll-lock привязан к той же видимости — лок не может «залипнуть»
    // на невидимой модалке (баг: нет скролла после закрытия оплаты).
    expect(paywallModalSource).toContain(
      "props.open && widgetState.value !== 'open'"
    );
    expect(paywallModalSource).toContain('useBodyScrollLock(overlayVisible)');
    expect(checkoutModalSource).toContain("widgetState.value !== 'open'");
    expect(checkoutModalSource).toContain('useBodyScrollLock(shellVisible)');

    // Ошибка загрузки не сбрасывает токен молча: пользователь видит текст
    // ошибки и кнопку «Повторить».
    expect(paywallModalSource).not.toContain('onError: resetWidget');
    expect(paywallModalSource).toContain("t('paywall.widgetError')");
    expect(paywallModalSource).toContain("t('paywall.widgetRetry')");
    expect(checkoutModalSource).not.toContain("onError: () => emit('back')");
    expect(checkoutModalSource).toContain("t('paywall.widgetRetry')");
  });

  it('sends the interview return path so minute-pack payments come back to the session', () => {
    const paymentReturnSource = readFileSync(
      'app/composables/usePaymentReturn.ts',
      'utf8'
    );
    expect(source).toContain('usePaymentReturn');
    expect(paymentReturnSource).toContain("route.query.payment === 'return'");
    expect(realtimeVoicePanelSource).toContain(
      ':return-path="`/interview/${sessionId}`"'
    );
    expect(paywallModalSource).toContain('returnPath?: string');
    expect(paywallModalSource).toContain('props.returnPath');
  });
});

describe('pricing subscription management and gift checkout', () => {
  it('labels the saved payment method by its real type', () => {
    expect(source).toContain("method.methodType === 'sbp'");
    expect(source).toContain("t('pricing.paymentMethodSbp')");
    expect(source).toContain("t('pricing.paymentMethodLinked')");
    expect(source).toContain('paymentMethodActionLabel');
    expect(source).toContain("t('pricing.replacePaymentMethod')");
  });

  it('opens a focused checkout modal with a persistent gift mode and recipient email', () => {
    expect(source).toContain('selectedPlanId');
    expect(source).toContain('giftMode');
    expect(source).toContain('recipientEmail');
    expect(source).toContain('gift: isGift');
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
    expect(layoutSource).toContain('/pricing?checkout=gift&plan=pass_30d');
    expect(layoutSource).toContain("t('layout.giftAction')");
    expect(layoutSource).toContain("t('layout.shareAction')");
    expect(layoutSource).toContain('shareServiceContent');
    const sidebarNav = layoutSource.match(
      /<nav class="nav"[\s\S]*?<\/nav>/
    )?.[0];
    expect(sidebarNav).toBeDefined();
    expect(sidebarNav).not.toContain('sidebar-quick-actions');
    expect(sidebarNav).not.toContain('sidebar-action--gift');
    expect(sidebarNav!.indexOf('t(`nav.${item.key}`)')).toBeLessThan(
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

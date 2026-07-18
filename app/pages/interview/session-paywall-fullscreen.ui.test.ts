import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sessionSource = readFileSync('app/pages/interview/[id].vue', 'utf8');
const paywallSource = readFileSync(
  'app/components/billing/PaywallModal.vue',
  'utf8'
);
const panelSource = readFileSync(
  'app/components/realtime/RealtimeVoicePanel.vue',
  'utf8'
);

// Покупка пакета минут из пейволла во время интервью: псевдо-fullscreen
// (call--fs) не должен перекрывать оплату, а после оплаты пользователь
// возвращается в это же интервью.
describe('interview paywall over pseudo-fullscreen', () => {
  it('collapses call--fs before opening the YooKassa modal', () => {
    // Страница предоставляет выход из полноэкранного режима...
    expect(sessionSource).toContain('provide(FullscreenEscapeKey');
    expect(sessionSource).toContain('isFullscreen.value = false');
    // ...а пейволл вызывает его при получении checkout-токена.
    expect(paywallSource).toContain('inject(FullscreenEscapeKey, null)');
    expect(paywallSource).toContain('fullscreenEscape?.exit()');
  });

  it('renders the paywall above call--fs regardless of DOM order', () => {
    expect(sessionSource).toContain('.call--fs');
    expect(sessionSource).toMatch(/\.call--fs\s*\{[^}]*z-index:\s*200/);
    expect(paywallSource).toMatch(/\.paywall-overlay\s*\{[^}]*z-index:\s*300/s);
  });

  it('reconciles a minute-pack payment return right on the session page', () => {
    expect(panelSource).toContain(':return-path="`/interview/${sessionId}`"');
    expect(sessionSource).toContain('usePaymentReturn');
    expect(sessionSource).toContain('paymentReturn.reconcile()');
    // Query чистится, чтобы обновление страницы не запускало сверку повторно.
    expect(sessionSource).toContain('delete query.payment');
    expect(sessionSource).toContain('delete query.orderId');
  });
});

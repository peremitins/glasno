import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reachYandexMetrikaGoal,
  trackPaidMetrikaGoal,
} from './yandexMetrika';

describe('Yandex Metrika goals', () => {
  const ym = vi.fn();
  const storage = new Map<string, string>();

  beforeEach(() => {
    ym.mockReset();
    storage.clear();
    vi.stubGlobal('window', {
      ym,
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a configured goal through the initialized counter', () => {
    expect(reachYandexMetrikaGoal('auth_completed')).toBe(true);
    expect(ym).toHaveBeenCalledWith(110383411, 'reachGoal', 'auth_completed');
  });

  it('maps each confirmed plan type to one paid goal per order', () => {
    trackPaidMetrikaGoal({
      orderId: 'pass-order',
      conversion: { planType: 'pass', amountRub: 1190 },
    });
    trackPaidMetrikaGoal({
      orderId: 'pass-order',
      conversion: { planType: 'pass', amountRub: 1190 },
    });
    trackPaidMetrikaGoal({
      orderId: 'minutes-order',
      conversion: { planType: 'minute_pack', amountRub: 390 },
    });

    expect(ym).toHaveBeenCalledTimes(2);
    expect(ym).toHaveBeenNthCalledWith(
      1,
      110383411,
      'reachGoal',
      'pass_paid'
    );
    expect(ym).toHaveBeenNthCalledWith(
      2,
      110383411,
      'reachGoal',
      'minute_pack_paid'
    );
  });
});

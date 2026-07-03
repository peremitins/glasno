import { describe, expect, it } from 'vitest';
import { getBillingPlan, getPaidBillingPlan, getPublicBillingPlans } from './plans';

describe('billing plans', () => {
  it('exposes monthly realtime voice minutes on paid plans', () => {
    const pro = getBillingPlan('pro_monthly');
    const careerPack = getBillingPlan('career_pack');

    expect(pro.realtimeVoiceMinutes).toBe(60);
    expect(careerPack.realtimeVoiceMinutes).toBe(100);
  });

  it('exposes purchasable realtime minute packs as addons', () => {
    for (const [id, minutes, priceRub] of [
      ['realtime_pack_30', 30, 490],
      ['realtime_pack_60', 60, 890],
      ['realtime_pack_120', 120, 1590],
    ] as const) {
      const pack = getBillingPlan(id);
      expect(pack.kind).toBe('addon');
      expect(pack.realtimeVoiceMinutes).toBe(minutes);
      expect(pack.priceRub).toBe(priceRub);
      expect(pack.interval).toBe('once');
      expect(pack.isCheckoutEnabled).toBe(true);
      expect(pack.requiresActiveSubscription).toBe(true);
    }
  });

  it('exposes the one-time prep plan', () => {
    const singlePrep = getBillingPlan('single_prep');

    expect(singlePrep.kind).toBe('one_time');
    expect(singlePrep.priceRub).toBe(399);
    expect(singlePrep.includedInterviews).toBe(1);
    expect(singlePrep.periodDays).toBe(7);
    expect(singlePrep.isCheckoutEnabled).toBe(true);
  });

  it('keeps legacy plans hidden but resolvable', () => {
    // realtime_voice_60: цена 590₽ ниже себестоимости 60 минут realtime.
    // career_pack: дифференциатор (стресс-вопросы) не реализован, по минутам
    // невыгоднее Pro + пакета.
    for (const legacyId of ['realtime_voice_60', 'career_pack']) {
      const legacy = getBillingPlan(legacyId);
      expect(legacy.isPublic).toBe(false);
      expect(legacy.isCheckoutEnabled).toBe(false);
      expect(() => getPaidBillingPlan(legacyId)).toThrow();
      const plans = getPublicBillingPlans();
      expect(plans.find((plan) => plan.id === legacyId)).toBeUndefined();
    }
  });

  it('keeps realtime voice metadata in public plan DTOs', () => {
    const plans = getPublicBillingPlans();

    expect(plans.find((plan) => plan.id === 'realtime_pack_60')).toMatchObject({
      kind: 'addon',
      realtimeVoiceMinutes: 60,
    });
    // Основная сетка: free, разовый, Pro (Career Pack скрыт как legacy).
    const mainIds = plans
      .filter((plan) => plan.kind !== 'addon')
      .map((plan) => plan.id);
    expect(mainIds).toEqual(['free', 'single_prep', 'pro_monthly']);
  });
});

import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../../../apps/landing/composables/useLandingContent';
import {
  BILLING_PLANS,
  getBillingPlan,
  getPaidBillingPlan,
  getPassPlans,
  getPublicBillingPlans,
} from './plans';

describe('billing plans v2', () => {
  it('keeps the approved pass grid exact (ТЗ тарифы v2, ревизия 2)', () => {
    const grid = getPassPlans().map((plan) => [
      plan.id,
      plan.durationDays,
      plan.priceRub,
      plan.realtimeVoiceMinutes,
    ]);
    expect(grid).toEqual([
      ['pass_7d', 7, 449, 30],
      ['pass_15d', 15, 899, 60],
      ['pass_30d', 30, 1190, 60],
      ['pass_90d', 90, 2290, 60],
      ['pass_180d', 180, 3490, 60],
      ['pass_365d', 365, 4990, 60],
    ]);
  });

  it('marks every pass as an auto-renewable checkout product', () => {
    for (const plan of getPassPlans()) {
      expect(plan.type).toBe('pass');
      expect(plan.autoRenewable).toBe(true);
      expect(plan.requiresActivePass).toBe(false);
      expect(plan.isCheckoutEnabled).toBe(true);
      expect(plan.features).toContain(
        'Интервью без ограничений — все форматы'
      );
      expect(plan.features).toContain(
        `${plan.realtimeVoiceMinutes} минут живого голосового интервью`
      );
    }
    expect(getPassPlans().filter((plan) => plan.isHighlighted)).toHaveLength(
      1
    );
    expect(getBillingPlan('pass_30d').isHighlighted).toBe(true);
  });

  it('exposes purchasable realtime minute packs bound to an active pass', () => {
    for (const [id, minutes, priceRub] of [
      ['realtime_pack_30', 30, 490],
      ['realtime_pack_60', 60, 890],
      ['realtime_pack_120', 120, 1590],
    ] as const) {
      const pack = getBillingPlan(id);
      expect(pack.type).toBe('minute_pack');
      expect(pack.realtimeVoiceMinutes).toBe(minutes);
      expect(pack.priceRub).toBe(priceRub);
      expect(pack.isCheckoutEnabled).toBe(true);
      expect(pack.autoRenewable).toBe(false);
      expect(pack.requiresActivePass).toBe(true);
      expect(pack.features).toContain('Действуют, пока активен пропуск');
    }
  });

  it('contains no legacy plans — v2 starts from scratch', () => {
    for (const legacyId of [
      'free',
      'single_prep',
      'pro_monthly',
      'career_pack',
      'realtime_voice_60',
    ]) {
      expect(BILLING_PLANS.find((plan) => plan.id === legacyId)).toBeUndefined();
      expect(() => getBillingPlan(legacyId)).toThrow('Тариф не найден');
    }
  });

  it('publishes the whole catalog with duration metadata in DTOs', () => {
    const plans = getPublicBillingPlans();
    expect(plans).toHaveLength(BILLING_PLANS.length);
    expect(plans.find((plan) => plan.id === 'pass_7d')).toMatchObject({
      type: 'pass',
      durationDays: 7,
      realtimeVoiceMinutes: 30,
      badge: 'Собес на носу',
    });
    expect(plans.find((plan) => plan.id === 'realtime_pack_60')).toMatchObject(
      {
        type: 'minute_pack',
        realtimeVoiceMinutes: 60,
      }
    );
    // Внутренние поля конфига не утекают в публичный DTO.
    for (const plan of plans) {
      expect(plan).not.toHaveProperty('autoRenewable');
      expect(plan).not.toHaveProperty('requiresActivePass');
    }
  });

  it('rejects checkout for unknown plans only', () => {
    expect(() => getPaidBillingPlan('pass_365d')).not.toThrow();
    expect(() => getPaidBillingPlan('unknown_plan')).toThrow();
  });

  it('keeps landing pricing copy synchronized with the catalog', () => {
    const landingPlans = useLandingContent().pricing.plans;
    // Лендинг показывает три ключевых срока; тексты должны совпадать
    // с каталогом приложения (ручная синхронизация из CLAUDE.md).
    expect(landingPlans.map((plan) => plan.id)).toEqual([
      'pass_7d',
      'pass_30d',
      'pass_90d',
    ]);
    for (const landingPlan of landingPlans) {
      const billingPlan = getBillingPlan(landingPlan.id);
      expect(landingPlan.name).toBe(billingPlan.name);
      expect(landingPlan.description).toBe(billingPlan.description);
      expect(landingPlan.features).toEqual(billingPlan.features);
      // Сравниваем только цифры: формат ru-RU использует неразрывные пробелы.
      expect(landingPlan.price.replace(/\D/g, '')).toBe(
        String(billingPlan.priceRub)
      );
    }
  });
});

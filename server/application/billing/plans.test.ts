import { describe, expect, it } from 'vitest';
import { getBillingPlan, getPublicBillingPlans } from './plans';

describe('billing plans', () => {
  it('exposes monthly realtime voice minutes on paid plans', () => {
    const pro = getBillingPlan('pro_monthly');
    const careerPack = getBillingPlan('career_pack');

    expect(pro.realtimeVoiceMinutes).toBe(60);
    expect(careerPack.realtimeVoiceMinutes).toBe(100);
  });

  it('exposes a dedicated realtime voice add-on package', () => {
    const addOn = getBillingPlan('realtime_voice_60');

    expect(addOn.kind).toBe('addon');
    expect(addOn.realtimeVoiceMinutes).toBe(60);
    expect(addOn.interval).toBe('once');
    expect(addOn.isCheckoutEnabled).toBe(true);
  });

  it('keeps realtime voice metadata in public plan DTOs', () => {
    const plans = getPublicBillingPlans();

    expect(plans.find((plan) => plan.id === 'realtime_voice_60')).toMatchObject({
      kind: 'addon',
      realtimeVoiceMinutes: 60,
    });
  });
});

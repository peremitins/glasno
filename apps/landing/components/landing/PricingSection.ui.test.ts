import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../../composables/useLandingContent';

const source = readFileSync(
  'apps/landing/components/landing/PricingSection.vue',
  'utf8'
);

describe('PricingSection', () => {
  it('shows the three key full-access passes with prices from the approved grid', () => {
    const { pricing } = useLandingContent();

    expect(
      pricing.plans.map(({ id, price, period }) => ({ id, price, period }))
    ).toEqual([
      {
        id: 'pass_7d',
        price: '449 ₽',
        period: '7 дней · 30 минут голоса',
      },
      {
        id: 'pass_30d',
        price: '1 190 ₽',
        period: '30 дней · 60 минут голоса',
      },
      {
        id: 'pass_90d',
        price: '2 290 ₽',
        period: '90 дней · 60 минут голоса',
      },
    ]);
    expect(pricing.plans[1]?.highlighted).toBe(true);
    // Остальные сроки упомянуты отдельной строкой, автопродление раскрыто.
    expect(pricing.plansNote).toContain('365 дней — 4 990 ₽');
    expect(pricing.subtitle).toContain('Продлевается автоматически');
    expect(pricing.packsNote).toBe(
      'Пакеты минут докупаются к активному доступу.'
    );
    expect(source).toContain('pricing.plansNote');
    expect(source).toContain(':lead="pricing.subtitle"');
  });

  it('keeps badges in the card header and stretches cards evenly', () => {
    expect(source).toContain('<div class="plan__head">');
    expect(source).toMatch(
      /<div class="plan__head">[\s\S]*?<h3[\s\S]*?<span v-if="plan\.badge" class="plan__badge"/
    );
    expect(source).toMatch(/\.pricing__grid\s*{[^}]*align-items:\s*stretch;/);
    expect(source).toMatch(/\.plan\s*{[^}]*height:\s*100%;/);
    expect(source).toMatch(/\.plan__badge\s*{[^}]*position:\s*static;/);
    expect(source).toMatch(/\.plan__badge\s*{[^}]*flex:\s*none;/);
    expect(source).toMatch(/\.plan__features\s*{[^}]*flex:\s*1;/);
  });
});

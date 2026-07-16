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
    // Остальные сроки упомянуты отдельной строкой, ценность доступа раскрыта.
    expect(pricing.plansNote).toContain('365 дней за 4 990 ₽');
    expect(pricing.subtitle).toContain('разбор и PDF-отчёт');
    expect(pricing.packsNote).toBe(
      'Пакеты минут докупаются к активному доступу.'
    );
    expect(source).toContain('pricing.plansNote');
    expect(source).toContain(':lead="pricing.subtitle"');
  });

  it('keeps the badge row above the name and stretches cards evenly', () => {
    expect(source).toContain('<div class="plan__head">');
    // Бейдж вынесен отдельной строкой НАД названием: название получает всю
    // ширину и укладывается в одну строку.
    expect(source).toMatch(
      /<div class="plan__head">[\s\S]*?class="plan__badge"[\s\S]*?<h3 class="plan__name"/
    );
    // Карточки без бейджа резервируют строку через placeholder — высоты равны.
    expect(source).toContain("'plan__badge--empty': !plan.badge");
    expect(source).toMatch(/\.plan__badge--empty\s*{[^}]*visibility:\s*hidden;/);
    expect(source).toMatch(/\.plan__head\s*{[^}]*flex-direction:\s*column;/);
    expect(source).toMatch(/\.pricing__grid\s*{[^}]*align-items:\s*stretch;/);
    expect(source).toMatch(/\.plan\s*{[^}]*height:\s*100%;/);
    expect(source).toMatch(/\.plan__badge\s*{[^}]*flex:\s*none;/);
    expect(source).toMatch(/\.plan__features\s*{[^}]*flex:\s*1;/);
  });

  it('keeps the price from wrapping (rouble sign stays on one line)', () => {
    // Цена над периодом + nowrap: «1 190 ₽» не разрывается на две строки.
    expect(source).toMatch(/\.plan__price\s*{[^}]*flex-direction:\s*column;/);
    expect(source).toMatch(
      /\.plan__price-value\s*{[^}]*white-space:\s*nowrap;/
    );
  });
});

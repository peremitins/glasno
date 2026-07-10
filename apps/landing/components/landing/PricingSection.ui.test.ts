import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../../composables/useLandingContent';

const source = readFileSync(
  'apps/landing/components/landing/PricingSection.vue',
  'utf8'
);

describe('PricingSection', () => {
  it('shows the approved Free, one-time and Pro offers', () => {
    const { pricing } = useLandingContent();

    expect(
      pricing.plans.map(({ id, description, features }) => ({
        id,
        description,
        features,
      }))
    ).toEqual([
      {
        id: 'free',
        description: 'Попробуйте формат без оплаты.',
        features: [
          '1 быстрое интервью на 5–7 минут',
          'Ответы голосом или текстом',
          'Разбор с оценкой и рекомендациями',
        ],
      },
      {
        id: 'single_prep',
        description: 'Одна серьёзная репетиция перед конкретным интервью.',
        features: [
          '1 интервью любой длины и глубины',
          '30 минут живого голосового интервью',
          'Подробный разбор и PDF-отчёт',
          'Докупка минут',
        ],
      },
      {
        id: 'pro_monthly',
        description: 'Для активного поиска и регулярной практики.',
        features: [
          'Интервью без ограничений',
          '60 минут живого голосового интервью',
          'История прогресса и разборы в PDF',
          'Докупка минут',
        ],
      },
    ]);
    expect(pricing.packsNote).toBe('Докупаются к Pro и Разовой подготовке.');
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

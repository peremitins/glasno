import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../../composables/useLandingContent';

const source = readFileSync(
  'apps/landing/components/landing/HowItWorks.vue',
  'utf8'
);

describe('HowItWorks', () => {
  it('describes both training roles through five concrete steps', () => {
    const { steps } = useLandingContent();

    expect(steps).toHaveLength(5);
    expect(steps.map(({ title }) => title)).toEqual([
      'Выберите, что тренируете',
      'Добавьте контекст',
      'Соберите сценарий',
      'Проведите интервью',
      'Разберите результат',
    ]);
    expect(steps[0]?.text).toContain('AI-кандидатом');
    expect(steps.map(({ icon }) => icon)).toEqual([
      'role',
      'context',
      'settings',
      'interview',
      'report',
    ]);
  });

  it('guards horizontal movement and gives wide screens a meaningful scroll distance', () => {
    expect(source).toContain('iconById[step.icon]');
    expect(source).toContain('Math.max(0, trackEl.scrollWidth - vpEl.clientWidth)');
    expect(source).toContain('Math.max(distance() * 1.2, window.innerHeight)');
    expect(source).toMatch(
      /class="hiw__viewport"[\s\S]*class="hiw__head l-container"[\s\S]*class="hiw__track"/
    );
  });

  it('does not let the intrinsic track width shift the section heading', () => {
    expect(source).toMatch(
      /\.hiw__viewport\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/
    );
  });

  it('has static fallbacks for mobile and reduced-motion users', () => {
    expect(source).toContain('(prefers-reduced-motion: reduce)');
    expect(source).toMatch(
      /@media \(max-width: 899px\)[\s\S]*?\.hiw__track\s*{[^}]*flex-direction:\s*column;/
    );
  });
});

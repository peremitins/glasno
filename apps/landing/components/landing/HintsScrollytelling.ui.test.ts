import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useLandingContent } from '../../composables/useLandingContent';

const source = readFileSync(
  'apps/landing/components/landing/HintsScrollytelling.vue',
  'utf8'
);

describe('HintsScrollytelling', () => {
  it('matches the current candidate and interviewer hint behavior', () => {
    const { hints } = useLandingContent();

    expect(hints.eyebrow).toBe('Подсказки во время интервью');
    expect(hints.title).toBe('Следующий шаг — перед глазами.');
    expect(hints.modes.map(({ id }) => id)).toEqual([
      'candidate',
      'interviewer',
    ]);
    expect(hints.modes[0]?.sections.map(({ label }) => label)).toEqual([
      'Фокус ответа',
      'План',
      'Ключевые понятия',
      'Короткий пример',
    ]);
    expect(hints.modes[1]?.sections.map(({ label }) => label)).toEqual([
      'Что проверить',
      'Основной вопрос',
      'Возможные уточнения',
    ]);
    expect(hints.note).toBe(
      'Подсказки обновляются под текущий вопрос и ход разговора.'
    );
  });

  it('renders both modes and only pins their transition on desktop', () => {
    expect(source).toContain('v-for="mode in hints.modes"');
    expect(source).toContain("'.hint-demo'");
    expect(source).toContain("'.hint-demo__section'");
    expect(source).toMatch(
      /@media \(max-width: 899px\)[\s\S]*?\.hints__demos\s*{[^}]*grid-template-columns:\s*1fr;/
    );
  });

  it('keeps the animated cards inside a standard desktop viewport', () => {
    expect(source).toMatch(
      /\.hint-demo__sections\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/
    );
    expect(source).toMatch(
      /@media \(max-width: 899px\)[\s\S]*?\.hint-demo__sections\s*{[^}]*grid-template-columns:\s*1fr;/
    );
  });
});

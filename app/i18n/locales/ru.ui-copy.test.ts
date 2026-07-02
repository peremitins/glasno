import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const messages = JSON.parse(readFileSync('app/i18n/locales/ru.json', 'utf8'));

function collectStrings(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) =>
    collectStrings(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe('russian UI copy', () => {
  it('does not mention the brand name inside explanatory question copy', () => {
    const text = collectStrings(messages.interview)
      .map(([, value]) => value)
      .join('\n');

    expect(text).not.toContain('JobAI не добавит');
    expect(text).not.toContain('вопросами JobAI');
    expect(text).not.toContain('вопросы JobAI');
    expect(text).not.toContain('Мои + JobAI');
    expect(text).not.toContain('JobAI очистит');
  });

  it('uses profession/vacancy wording on the new interview page instead of role wording', () => {
    const entries = collectStrings(messages.interview.new);
    const texts = entries.map(([, value]) => value).join('\n');

    expect(texts).not.toMatch(/(^|[^а-яё])роль([^а-яё]|$)/iu);
    expect(texts).not.toMatch(/(^|[^а-яё])роли([^а-яё]|$)/iu);
    expect(texts).not.toMatch(/(^|[^а-яё])ролью([^а-яё]|$)/iu);
  });

  it('does not present session goal duration as a guaranteed timer', () => {
    const goalTexts = collectStrings(messages.interview.goal)
      .map(([, value]) => value)
      .join('\n');

    expect(goalTexts).not.toContain('Разогрев перед интервью');
    expect(goalTexts).not.toContain('Баланс практики и темпа');
    expect(goalTexts).not.toContain('Длинный прогон с уточнениями');
    expect(goalTexts).not.toMatch(/\d+\s*-\s*\d+\s*мин/);
    expect(goalTexts).toContain('3 вопроса');
    expect(goalTexts).toContain('6 вопросов');
    expect(goalTexts).toContain('10 вопросов');
  });

  it('keeps the dashboard hero concise', () => {
    expect(messages.dashboard.title).toBe('Тренировка к интервью');
    expect(messages.dashboard.subtitle.length).toBeLessThanOrEqual(70);
    expect(messages.dashboard.title).not.toContain('Кабинет подготовки');
  });

  it('explains STAR in the term tooltip with English expansion', () => {
    expect(messages.common.terms.star.description).toContain(
      'ситуация (S — Situation)'
    );
    expect(messages.common.terms.star.description).toContain(
      'задача (T — Task)'
    );
    expect(messages.common.terms.star.description).toContain(
      'действие (A — Action)'
    );
    expect(messages.common.terms.star.description).toContain(
      'результат (R — Result)'
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  getRepeatQuestionLimit,
  selectRepeatPreferences,
} from './scheduling';

const preference = (id: string, lastPracticedAt: string | null) => ({
  id,
  status: 'repeat' as const,
  question: `Вопрос ${id}`,
  lastPracticedAt: lastPracticedAt ? new Date(lastPracticedAt) : null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

describe('repeat question scheduling', () => {
  it('uses every free slot except one reserved for a new contextual question', () => {
    expect(getRepeatQuestionLimit(3)).toBe(2);
    expect(getRepeatQuestionLimit(6)).toBe(5);
    expect(getRepeatQuestionLimit(10)).toBe(9);
  });

  it('does not displace user-authored questions', () => {
    expect(getRepeatQuestionLimit(6, 5)).toBe(0);
    expect(getRepeatQuestionLimit(3, 3)).toBe(0);
  });

  it('selects never-practiced and least-recently-practiced questions first', () => {
    const selected = selectRepeatPreferences(
      [
        preference('recent', '2026-07-10T00:00:00.000Z'),
        preference('never', null),
        preference('old', '2026-06-01T00:00:00.000Z'),
      ],
      2
    );

    expect(selected.map((item) => item.id)).toEqual(['never', 'old']);
  });
});

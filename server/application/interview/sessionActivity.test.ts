import { describe, expect, it } from 'vitest';
import { calculateSessionActiveSeconds } from './sessionActivity';

function turn(
  messages: Array<{ role: 'user' | 'interviewer'; atSeconds: number }>
) {
  const base = Date.parse('2026-07-22T10:00:00.000Z');
  return {
    metadata: {
      dialogue: messages.map((message) => ({
        role: message.role,
        content: 'реплика',
        at: new Date(base + message.atSeconds * 1000).toISOString(),
      })),
    },
  };
}

describe('calculateSessionActiveSeconds', () => {
  it('returns zero for a session without dialogue', () => {
    expect(calculateSessionActiveSeconds([])).toBe(0);
    expect(calculateSessionActiveSeconds([{ metadata: null }])).toBe(0);
  });

  it('counts the real pauses of an engaged conversation', () => {
    const seconds = calculateSessionActiveSeconds([
      turn([
        { role: 'user', atSeconds: 0 },
        { role: 'interviewer', atSeconds: 4 },
        { role: 'user', atSeconds: 30 },
        { role: 'interviewer', atSeconds: 35 },
      ]),
    ]);

    expect(seconds).toBe(35);
  });

  it('does not count the time a user was away', () => {
    // Ушёл на три часа и вернулся: пауза не должна съесть бюджет.
    const seconds = calculateSessionActiveSeconds([
      turn([
        { role: 'user', atSeconds: 0 },
        { role: 'interviewer', atSeconds: 10 },
        { role: 'user', atSeconds: 3 * 60 * 60 },
        { role: 'interviewer', atSeconds: 3 * 60 * 60 + 10 },
      ]),
    ]);

    // 10с до перерыва + 60с потолка за сам перерыв + 10с после.
    expect(seconds).toBe(80);
  });

  it('caps any single pause at one minute', () => {
    const seconds = calculateSessionActiveSeconds([
      turn([
        { role: 'user', atSeconds: 0 },
        { role: 'interviewer', atSeconds: 600 },
      ]),
    ]);

    expect(seconds).toBe(60);
  });

  it('charges a minimum per exchange so fast spam still burns the budget', () => {
    const messages = Array.from({ length: 200 }, (_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'interviewer') as
        | 'user'
        | 'interviewer',
      // Реплики почти без пауз — «настоящего» времени почти нет.
      atSeconds: index * 0.2,
    }));

    const seconds = calculateSessionActiveSeconds([turn(messages)]);

    // 100 реплик пользователя × 5с — иначе спам обошёл бы лимит.
    expect(seconds).toBe(500);
  });

  it('sums activity across all turns of a stepwise session', () => {
    const seconds = calculateSessionActiveSeconds([
      turn([
        { role: 'user', atSeconds: 0 },
        { role: 'interviewer', atSeconds: 20 },
      ]),
      turn([
        { role: 'user', atSeconds: 40 },
        { role: 'interviewer', atSeconds: 60 },
      ]),
    ]);

    expect(seconds).toBe(60);
  });

  it('ignores malformed timestamps instead of throwing', () => {
    const seconds = calculateSessionActiveSeconds([
      {
        metadata: {
          dialogue: [
            { role: 'user', content: 'x', at: 'не дата' },
            { role: 'user', content: 'x' },
            { role: 'interviewer', content: 'x', at: null },
          ],
        },
      },
    ]);

    expect(seconds).toBe(0);
  });
});

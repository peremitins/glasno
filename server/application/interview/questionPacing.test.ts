import { describe, expect, it } from 'vitest';
import {
  getQuestionPacingConfig,
  resolveQuestionPacing,
} from './questionPacing';

describe('question pacing', () => {
  it.each([
    ['quick', 5],
    ['standard', 8],
    ['deep', 12],
  ] as const)('sets the first reminder for %s after %i minutes', (goal, minutes) => {
    expect(getQuestionPacingConfig(goal)).toEqual({
      firstReminderAfterMinutes: minutes,
      reminderCooldownMinutes: 5,
    });
  });

  it('does not start the timer before the first user reply', () => {
    expect(
      resolveQuestionPacing({
        goal: 'standard',
        startedAt: null,
        lastReminderAt: null,
        now: new Date('2026-07-13T10:08:00.000Z'),
      })
    ).toEqual({ shouldRemind: false, nextReminderAt: null });
  });

  it('reminds on the next natural reply after the time limit', () => {
    expect(
      resolveQuestionPacing({
        goal: 'standard',
        startedAt: '2026-07-13T10:00:00.000Z',
        lastReminderAt: null,
        now: new Date('2026-07-13T10:08:00.000Z'),
      })
    ).toEqual({
      shouldRemind: true,
      nextReminderAt: '2026-07-13T10:08:00.000Z',
    });
  });

  it('waits five minutes before a repeated reminder', () => {
    expect(
      resolveQuestionPacing({
        goal: 'quick',
        startedAt: '2026-07-13T10:00:00.000Z',
        lastReminderAt: '2026-07-13T10:05:00.000Z',
        now: new Date('2026-07-13T10:09:59.000Z'),
      })
    ).toEqual({
      shouldRemind: false,
      nextReminderAt: '2026-07-13T10:10:00.000Z',
    });
  });
});

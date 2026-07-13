import { describe, expect, it } from 'vitest';
import { shouldSendQuestionTimeboxReminder } from './questionPacing';

describe('question pacing in realtime', () => {
  const pacing = {
    firstReminderAfterMinutes: 8,
    reminderCooldownMinutes: 5,
  };

  it('does not add a reminder before the first user reply', () => {
    expect(
      shouldSendQuestionTimeboxReminder({
        pacing,
        startedAt: null,
        lastReminderAt: null,
        now: new Date('2026-07-13T10:10:00.000Z'),
      })
    ).toBe(false);
  });

  it('adds a reminder to the next natural response after the deadline', () => {
    expect(
      shouldSendQuestionTimeboxReminder({
        pacing,
        startedAt: '2026-07-13T10:00:00.000Z',
        lastReminderAt: null,
        now: new Date('2026-07-13T10:08:00.000Z'),
      })
    ).toBe(true);
  });

  it('respects the reminder cooldown in realtime', () => {
    expect(
      shouldSendQuestionTimeboxReminder({
        pacing,
        startedAt: '2026-07-13T10:00:00.000Z',
        lastReminderAt: '2026-07-13T10:08:00.000Z',
        now: new Date('2026-07-13T10:12:59.000Z'),
      })
    ).toBe(false);
  });
});

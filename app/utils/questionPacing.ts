export interface QuestionPacing {
  firstReminderAfterMinutes: number;
  reminderCooldownMinutes: number;
}

export function shouldSendQuestionTimeboxReminder(params: {
  pacing: QuestionPacing;
  startedAt: string | null;
  lastReminderAt: string | null;
  now?: Date;
}): boolean {
  if (!params.startedAt) return false;

  const startedAt = new Date(params.startedAt);
  if (Number.isNaN(startedAt.getTime())) return false;

  const lastReminderAt = params.lastReminderAt
    ? new Date(params.lastReminderAt)
    : null;
  const baseline =
    lastReminderAt && !Number.isNaN(lastReminderAt.getTime())
      ? lastReminderAt
      : startedAt;
  const minutes = lastReminderAt
    ? params.pacing.reminderCooldownMinutes
    : params.pacing.firstReminderAfterMinutes;
  const now = params.now ?? new Date();

  return now.getTime() >= baseline.getTime() + minutes * 60_000;
}

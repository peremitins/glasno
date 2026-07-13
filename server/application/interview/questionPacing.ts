import type { InterviewSessionGoal } from '@/shared/dto';

export interface QuestionPacingConfig {
  firstReminderAfterMinutes: number;
  reminderCooldownMinutes: number;
}

const QUESTION_PACING_CONFIG: Record<
  InterviewSessionGoal,
  QuestionPacingConfig
> = {
  quick: {
    firstReminderAfterMinutes: 5,
    reminderCooldownMinutes: 5,
  },
  standard: {
    firstReminderAfterMinutes: 8,
    reminderCooldownMinutes: 5,
  },
  deep: {
    firstReminderAfterMinutes: 12,
    reminderCooldownMinutes: 5,
  },
};

export function getQuestionPacingConfig(
  goal: InterviewSessionGoal
): QuestionPacingConfig {
  return QUESTION_PACING_CONFIG[goal];
}

export function resolveQuestionPacing(params: {
  goal: InterviewSessionGoal;
  startedAt: string | null;
  lastReminderAt: string | null;
  now: Date;
}): { shouldRemind: boolean; nextReminderAt: string | null } {
  if (!params.startedAt) {
    return { shouldRemind: false, nextReminderAt: null };
  }

  const startedAt = new Date(params.startedAt);
  if (Number.isNaN(startedAt.getTime())) {
    return { shouldRemind: false, nextReminderAt: null };
  }

  const config = getQuestionPacingConfig(params.goal);
  const lastReminderAt = params.lastReminderAt
    ? new Date(params.lastReminderAt)
    : null;
  const baseline =
    lastReminderAt && !Number.isNaN(lastReminderAt.getTime())
      ? lastReminderAt
      : startedAt;
  const delayMinutes = lastReminderAt
    ? config.reminderCooldownMinutes
    : config.firstReminderAfterMinutes;
  const nextReminderAt = new Date(
    baseline.getTime() + delayMinutes * 60_000
  ).toISOString();

  return {
    shouldRemind: params.now.getTime() >= new Date(nextReminderAt).getTime(),
    nextReminderAt,
  };
}

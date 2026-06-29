export interface RealtimeVoiceUsageRecord {
  startedAt: Date;
  endedAt: Date | null;
  lastActivityAt: Date | null;
}

export function calculateRealtimeVoiceUsageSeconds(
  sessions: RealtimeVoiceUsageRecord[],
  params: {
    windowStart: Date;
    windowEnd: Date;
    idleTimeoutMs: number;
    now?: Date;
  }
): number {
  return sessions.reduce(
    (sum, session) =>
      sum + calculateRealtimeVoiceSessionSeconds(session, params),
    0
  );
}

export function calculateRealtimeVoiceSessionSeconds(
  session: RealtimeVoiceUsageRecord,
  params: {
    windowStart: Date;
    windowEnd: Date;
    idleTimeoutMs: number;
    now?: Date;
  }
): number {
  const now = params.now ?? new Date();
  const effectiveEnd = session.endedAt
    ? session.endedAt
    : resolveIdleCappedEnd({
        startedAt: session.startedAt,
        lastActivityAt: session.lastActivityAt,
        idleTimeoutMs: params.idleTimeoutMs,
        now,
      });

  const start = maxDate(session.startedAt, params.windowStart);
  const end = minDate(effectiveEnd, params.windowEnd);

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

export function resolveRealtimeVoiceEndAt(params: {
  startedAt: Date;
  lastActivityAt: Date | null;
  hardLimitMs: number;
  idleTimeoutMs: number;
  now?: Date;
}): Date {
  const now = params.now ?? new Date();
  const hardEnd = new Date(params.startedAt.getTime() + params.hardLimitMs);
  const idleEnd = new Date(
    (params.lastActivityAt ?? params.startedAt).getTime() + params.idleTimeoutMs
  );
  const endedAt = minDate(now, hardEnd, idleEnd);
  return endedAt < params.startedAt ? params.startedAt : endedAt;
}

function resolveIdleCappedEnd(params: {
  startedAt: Date;
  lastActivityAt: Date | null;
  idleTimeoutMs: number;
  now: Date;
}): Date {
  const lastActivityAt = params.lastActivityAt ?? params.startedAt;
  const idleDeadline = new Date(lastActivityAt.getTime() + params.idleTimeoutMs);
  return minDate(params.now, idleDeadline);
}

function minDate(first: Date, ...rest: Date[]): Date {
  return rest.reduce((min, item) => (item < min ? item : min), first);
}

function maxDate(first: Date, ...rest: Date[]): Date {
  return rest.reduce((max, item) => (item > max ? item : max), first);
}

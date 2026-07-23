// Наблюдение за накруткой бесплатных интервью.
//
// Сознательно не блокируем: за одним IPv4 в мобильных сетях РФ (CGNAT) стоят
// тысячи абонентов, а офисные и университетские сети выглядят так же. Любой
// жёсткий лимит по адресу отрезал бы добросовестных пользователей. Поэтому
// только считаем и сообщаем — решение принимает человек.

export const TRIAL_ABUSE_WINDOW_HOURS = 24;
export const TRIAL_ABUSE_ALERT_THRESHOLD = 5;
// Окно наблюдения — сутки, поэтому дольше месяца отпечатки не нужны.
export const CREATOR_IP_HASH_TTL_DAYS = 30;

export interface TrialAbuseMonitorDeps {
  countTrialSessionsByIpHashSince: (
    ipHash: string,
    since: Date
  ) => Promise<number>;
  notifyTrialAbuseSuspected: (params: {
    trialCount: number;
    windowHours: number;
    ipHashPrefix: string;
  }) => Promise<void>;
}

export async function checkTrialAbuse(
  deps: TrialAbuseMonitorDeps,
  ipHash: string,
  now: Date = new Date()
): Promise<{ trialCount: number; alerted: boolean }> {
  const since = new Date(
    now.getTime() - TRIAL_ABUSE_WINDOW_HOURS * 60 * 60 * 1000
  );
  const trialCount = await deps.countTrialSessionsByIpHashSince(ipHash, since);

  // Алертим ровно в момент пересечения порога: иначе каждая следующая сессия
  // того же адреса засыпала бы канал одинаковыми сообщениями.
  if (trialCount !== TRIAL_ABUSE_ALERT_THRESHOLD) {
    return { trialCount, alerted: false };
  }

  await deps.notifyTrialAbuseSuspected({
    trialCount,
    windowHours: TRIAL_ABUSE_WINDOW_HOURS,
    // В сообщение идёт только префикс хэша — достаточно, чтобы отличать
    // адреса между собой, и невозможно восстановить IP.
    ipHashPrefix: ipHash.slice(0, 12),
  });
  return { trialCount, alerted: true };
}

import type { InterviewTurnRecord } from '@/server/interface/interviewRepository';

// Активное время интервью — бюджет бесплатной сессии.
//
// Счётчик событийный, а не часы: время берётся из таймстемпов уже сохранённых
// реплик. Работающего таймера не существует, поэтому его не нужно «ставить на
// паузу» — если пользователь закрыл вкладку, ушёл со страницы или отвлёкся,
// реплик нет, и время просто не начисляется. По этой же причине клиент ничего
// не сообщает о своей активности: подделать счётчик нечем.
const MAX_GAP_SECONDS = 60;
// Нижний вес одной реплики: страховка от спама короткими сообщениями, при
// которой паузы почти нулевые. На живого человека не влияет.
const MIN_SECONDS_PER_EXCHANGE = 5;

// Бюджет бесплатного интервью. По его исчерпании сессия мягко завершается и
// пользователь получает отчёт — это не «доступ закрыт», а конец тренировки.
export const TRIAL_SESSION_ACTIVE_LIMIT_SECONDS = 20 * 60;

interface DialogueTimestamp {
  role: string;
  at: number;
}

export function calculateSessionActiveSeconds(
  turns: Array<Pick<InterviewTurnRecord, 'metadata'>>
): number {
  const messages = turns
    .flatMap((turn) => readDialogueTimestamps(turn.metadata))
    .sort((left, right) => left.at - right.at);

  if (messages.length < 2) {
    return messages.length ? MIN_SECONDS_PER_EXCHANGE : 0;
  }

  let counted = 0;
  for (let index = 1; index < messages.length; index += 1) {
    const gapSeconds =
      (messages[index]!.at - messages[index - 1]!.at) / 1000;
    if (gapSeconds <= 0) continue;
    counted += Math.min(gapSeconds, MAX_GAP_SECONDS);
  }

  const userMessages = messages.filter(
    (message) => message.role === 'user'
  ).length;
  return Math.max(counted, userMessages * MIN_SECONDS_PER_EXCHANGE);
}

function readDialogueTimestamps(metadata: unknown): DialogueTimestamp[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const dialogue = (metadata as { dialogue?: unknown }).dialogue;
  if (!Array.isArray(dialogue)) return [];

  return dialogue.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as { role?: unknown; at?: unknown };
    if (typeof raw.at !== 'string') return [];
    const at = new Date(raw.at).getTime();
    if (Number.isNaN(at)) return [];
    return [{ role: raw.role === 'user' ? 'user' : 'interviewer', at }];
  });
}

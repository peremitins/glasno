// Окно диалога для промптов LLM.
//
// В непрерывном интервью весь разговор живёт в одном этапе, поэтому диалог
// растёт без предела: если отдавать его целиком, контекст каждого запроса
// увеличивается линейно, а суммарная стоимость сессии — квадратично.
//
// Берём «голову» и «хвост»: первые реплики фиксируют, что кандидат рассказал
// о себе в начале (без них AI-кандидат начинает противоречить сам себе), а
// последние дают актуальный контекст ответа.
//
// ВАЖНО: это только слой промптов. В БД диалог всегда хранится целиком, и
// отчёт строится по полной записи — обрезка на разбор интервью не влияет.

export const INTERVIEW_DIALOGUE_HEAD_MESSAGES = 4;
export const INTERVIEW_DIALOGUE_TAIL_MESSAGES = 16;

export interface InterviewDialogueWindow<T> {
  head: T[];
  skipped: number;
  tail: T[];
}

export function windowInterviewDialogue<T>(
  messages: T[],
  options?: { head?: number; tail?: number }
): InterviewDialogueWindow<T> {
  const head = Math.max(0, options?.head ?? INTERVIEW_DIALOGUE_HEAD_MESSAGES);
  const tail = Math.max(0, options?.tail ?? INTERVIEW_DIALOGUE_TAIL_MESSAGES);

  // Пропускать имеет смысл только если это экономит хотя бы одну реплику.
  if (messages.length <= head + tail) {
    return { head: messages, skipped: 0, tail: [] };
  }

  return {
    head: messages.slice(0, head),
    skipped: messages.length - head - tail,
    tail: messages.slice(messages.length - tail),
  };
}

export function interviewDialogueSkipMarker(skipped: number): string {
  return `[…пропущено реплик: ${skipped}…]`;
}

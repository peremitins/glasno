export type InterviewTextSegment =
  | {
      kind: 'text';
      value: string;
    }
  | {
      kind: 'term';
      value: string;
      term: 'star';
    };

const TERM_PATTERN = /\bSTAR\b/gi;

export function splitTextByInterviewTerms(text: string): InterviewTextSegment[] {
  if (!text) return [];

  const segments: InterviewTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TERM_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, index) });
    }

    segments.push({ kind: 'term', value: match[0], term: 'star' });
    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) });
  }

  return segments.length ? segments : [{ kind: 'text', value: text }];
}

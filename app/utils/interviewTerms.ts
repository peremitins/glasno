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

export type InterviewTextDisplaySegment =
  | Extract<InterviewTextSegment, { kind: 'text' }>
  | (Extract<InterviewTextSegment, { kind: 'term' }> & {
      attachedPunctuation?: string;
    });

type InterviewTextDisplayTermSegment = Extract<
  InterviewTextDisplaySegment,
  { kind: 'term' }
>;
type InterviewTextDisplayPlainSegment = Extract<
  InterviewTextDisplaySegment,
  { kind: 'text' }
>;

const TERM_PATTERN = /\bSTAR\b/gi;
const LEADING_PUNCTUATION_PATTERN = /^([,.;:!?)}\]»”]+)/u;

interface TermMatch {
  index: number;
  end: number;
  term: 'star';
}

export function splitTextByInterviewTerms(text: string): InterviewTextSegment[] {
  if (!text) return [];

  const matches = selectTermMatches(text);
  if (!matches.length) return [{ kind: 'text', value: text }];

  const segments: InterviewTextSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    const index = match.index;
    if (index > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, index) });
    }

    segments.push({
      kind: 'term',
      value: text.slice(match.index, match.end),
      term: match.term,
    });
    cursor = match.end;
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) });
  }

  return segments.length ? segments : [{ kind: 'text', value: text }];
}

export function prepareInterviewTextDisplaySegments(
  segments: InterviewTextSegment[]
): InterviewTextDisplaySegment[] {
  const prepared: InterviewTextDisplaySegment[] = segments.map((segment) => ({
    ...segment,
  }));

  for (let index = 0; index < prepared.length - 1; index += 1) {
    const current = prepared[index];
    const next = prepared[index + 1];
    if (!isDisplayTermSegment(current) || !isDisplayTextSegment(next)) {
      continue;
    }

    const punctuation = next.value.match(LEADING_PUNCTUATION_PATTERN)?.[1];
    if (!punctuation) continue;

    current.attachedPunctuation = punctuation;
    next.value = next.value.slice(punctuation.length);
  }

  return prepared.filter(
    (segment) => segment.kind === 'term' || segment.value.length > 0
  );
}

function isDisplayTermSegment(
  segment: InterviewTextDisplaySegment | undefined
): segment is InterviewTextDisplayTermSegment {
  return segment?.kind === 'term';
}

function isDisplayTextSegment(
  segment: InterviewTextDisplaySegment | undefined
): segment is InterviewTextDisplayPlainSegment {
  return segment?.kind === 'text';
}

function selectTermMatches(text: string): TermMatch[] {
  const candidates: TermMatch[] = [];

  for (const match of text.matchAll(TERM_PATTERN)) {
    const index = match.index ?? 0;
    candidates.push({
      index,
      end: index + match[0].length,
      term: 'star',
    });
  }

  const occupied = Array.from({ length: text.length }, () => false);
  const selected: TermMatch[] = [];

  for (const candidate of candidates.sort(
    (left, right) =>
      right.end -
        right.index -
        (left.end - left.index) ||
      left.index - right.index
  )) {
    const overlaps = occupied
      .slice(candidate.index, candidate.end)
      .some(Boolean);
    if (overlaps) continue;

    for (let index = candidate.index; index < candidate.end; index += 1) {
      occupied[index] = true;
    }
    selected.push(candidate);
  }

  return selected.sort((left, right) => left.index - right.index);
}

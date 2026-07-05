import type { LearningTermCandidate } from '@/shared/dto';

export type InterviewTextSegment =
  | {
      kind: 'text';
      value: string;
    }
  | {
      kind: 'term';
      value: string;
      term: 'star';
    }
  | {
      kind: 'term';
      value: string;
      term: LearningTermCandidate;
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
  term: 'star' | LearningTermCandidate;
}

export function splitTextByInterviewTerms(
  text: string,
  dynamicTerms: LearningTermCandidate[] = []
): InterviewTextSegment[] {
  if (!text) return [];

  const matches = selectTermMatches(text, dynamicTerms);
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

function selectTermMatches(
  text: string,
  dynamicTerms: LearningTermCandidate[]
): TermMatch[] {
  const candidates: TermMatch[] = [];
  const seenDynamicTerms = new Set<string>();

  for (const term of dynamicTerms) {
    const phrase = term.phrase.trim();
    const key = phrase.toLocaleLowerCase();
    if (!phrase || seenDynamicTerms.has(key)) continue;
    seenDynamicTerms.add(key);
    candidates.push(...findPhraseMatches(text, phrase, term));
  }

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

function findPhraseMatches(
  text: string,
  phrase: string,
  term: LearningTermCandidate
): TermMatch[] {
  const matches: TermMatch[] = [];
  const lowerText = text.toLocaleLowerCase();
  // При смене регистра длина строки может измениться (например, «İ» → «i̇»),
  // тогда индексы сдвигаются относительно оригинала — ищем без сворачивания.
  const useLower = lowerText.length === text.length;
  const haystack = useLower ? lowerText : text;
  const needle = useLower ? phrase.toLocaleLowerCase() : phrase;
  let cursor = 0;

  while (cursor < text.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) break;
    const end = index + phrase.length;
    if (hasWordBoundary(text, index, end)) {
      matches.push({ index, end, term });
    }
    cursor = Math.max(index + 1, end);
  }

  return matches;
}

function hasWordBoundary(text: string, index: number, end: number): boolean {
  const before = index > 0 ? text.charAt(index - 1) : '';
  const after = end < text.length ? text.charAt(end) : '';
  return !isWordChar(before) && !isWordChar(after);
}

function isWordChar(value: string): boolean {
  return Boolean(value && /[\p{L}\p{N}_]/u.test(value));
}

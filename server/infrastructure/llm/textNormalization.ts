const SENTENCE_END_RE = /[.!?](?=\s|$)/g;

export function compactGeneratedText(
  value: unknown,
  fallback: string,
  maxLength: number
): string {
  const raw = typeof value === 'string' ? value : '';
  const compacted = raw.trim().replace(/\s+/g, ' ');
  const text = compacted || fallback;
  if (text.length <= maxLength) return text;
  return truncateAtNaturalBoundary(text, maxLength);
}

function truncateAtNaturalBoundary(text: string, maxLength: number): string {
  const limit = Math.max(1, maxLength);
  const slice = text.slice(0, limit).trimEnd();
  const sentenceEnd = findLastSentenceEnd(slice);

  if (sentenceEnd >= Math.floor(limit * 0.35)) {
    return slice.slice(0, sentenceEnd + 1).trim();
  }

  const wordBoundary = slice.lastIndexOf(' ');
  const candidate =
    wordBoundary >= Math.floor(limit * 0.5)
      ? slice.slice(0, wordBoundary).trim()
      : slice.trim();

  return ensureTerminalPunctuation(candidate, limit);
}

function findLastSentenceEnd(value: string): number {
  let result = -1;
  for (const match of value.matchAll(SENTENCE_END_RE)) {
    result = match.index ?? result;
  }
  return result;
}

function ensureTerminalPunctuation(value: string, maxLength: number): string {
  const stripped = value.replace(/[,:;—-]+$/u, '').trimEnd();
  if (!stripped) return '.';
  if (/[.!?]$/u.test(stripped)) return stripped;
  if (stripped.length >= maxLength) {
    return `${stripped.slice(0, Math.max(0, maxLength - 1)).trimEnd()}.`;
  }
  return `${stripped}.`;
}

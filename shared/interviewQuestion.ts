export function normalizeInterviewQuestionText(value: string): string {
  const normalized = value
    .trim()
    .replace(/^\d+[).:-]\s*/, '')
    .replace(/\s+/g, ' ');
  if (!normalized) return '';
  return /[?.!]$/u.test(normalized) ? normalized : `${normalized}?`;
}

export function canonicalInterviewQuestionKey(value: string): string {
  return normalizeInterviewQuestionText(value)
    .replace(/[?.!…]+$/u, '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

export function hasValidCustomInterviewQuestion(value?: string | null): boolean {
  const raw = value?.trim();
  if (!raw) return false;
  return raw
    .split(/\n|;|(?<=\?)\s+/)
    .map(normalizeInterviewQuestionText)
    .some((question) => question.length >= 8);
}

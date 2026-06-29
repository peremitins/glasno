export interface AppendFinalDictationTranscriptInput {
  currentText: string;
  sessionTranscript: string;
  finalTranscript: string;
}

export interface AppendFinalDictationTranscriptResult {
  text: string;
  sessionTranscript: string;
  delta: string;
}

export function appendFinalDictationTranscript(
  input: AppendFinalDictationTranscriptInput
): AppendFinalDictationTranscriptResult {
  const currentText = normalizeSpaces(input.currentText);
  const sessionTranscript = normalizeSpaces(input.sessionTranscript);
  const finalTranscript = normalizeSpaces(input.finalTranscript);
  const delta = extractFinalDelta(sessionTranscript, finalTranscript);
  const text = appendPhrase(currentText, delta);
  const nextSessionTranscript = appendPhrase(sessionTranscript, delta);

  return {
    text,
    sessionTranscript: nextSessionTranscript,
    delta,
  };
}

function extractFinalDelta(
  previousTranscript: string,
  nextTranscript: string
): string {
  if (!nextTranscript) return '';
  if (!previousTranscript) return nextTranscript;
  if (nextTranscript === previousTranscript) return '';
  if (nextTranscript.startsWith(`${previousTranscript} `)) {
    return nextTranscript.slice(previousTranscript.length).trim();
  }
  if (previousTranscript.includes(nextTranscript)) return '';
  return nextTranscript;
}

function appendPhrase(base: string, phrase: string): string {
  if (!phrase) return base;
  if (!base) return phrase;
  return `${base}${needsSeparator(base) ? ' ' : ''}${phrase}`;
}

function needsSeparator(value: string): boolean {
  return !/\s$/.test(value);
}

function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

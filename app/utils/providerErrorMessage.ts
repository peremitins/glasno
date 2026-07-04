const PROVIDER_NAME_RE = /\b(openai|chatgpt)\b/i;

export function sanitizeProviderErrorMessage(
  message: string | undefined | null,
  fallback: string
): string {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return fallback;
  if (PROVIDER_NAME_RE.test(text)) return fallback;
  return text;
}

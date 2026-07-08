import { ExplainLearningTermResponseDto } from '@/shared/dto';
import type {
  ExplainLearningTermRequest,
  ExplainLearningTermResponse,
  LearningTermContext,
} from '@/shared/dto';

const CACHE_VERSION = 'learning-terms-v2';
const MAX_SOURCE_TEXT_LENGTH = 2_000;
const explanationMemoryCache = new Map<string, ExplainLearningTermResponse>();

export function learningTermContextKey(context: LearningTermContext): string {
  return JSON.stringify({
    kind: context.kind,
    interviewSessionId: context.interviewSessionId ?? '',
    reportId: context.reportId ?? '',
    turnId: context.turnId ?? '',
    label: context.label ?? '',
  });
}

export function learningTermTextHash(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function useLearningTerms() {
  const api = useAPI();
  const activeTermKey = useState<string | null>(
    'learning-terms-active-key',
    () => null
  );

  async function explainTerm(
    input: ExplainLearningTermRequest
  ): Promise<ExplainLearningTermResponse> {
    const normalizedInput = normalizeExplainInput(input);
    const key = explanationCacheKey(normalizedInput);
    const cached = explanationMemoryCache.get(key) ?? readStoredExplanation(key);
    if (cached) {
      explanationMemoryCache.set(key, cached);
      return cached;
    }

    const response = await api<ExplainLearningTermResponse>(
      '/api/learning/terms/explain',
      {
        method: 'POST',
        body: normalizedInput,
      }
    );
    explanationMemoryCache.set(key, response);
    writeStoredValue(key, response);
    return response;
  }

  function setActiveTermKey(value: string | null) {
    activeTermKey.value = value;
  }

  return {
    activeTermKey,
    explainTerm,
    setActiveTermKey,
  };
}

function normalizeSourceText(value: string): string {
  return value.trim().slice(0, MAX_SOURCE_TEXT_LENGTH);
}

function normalizeExplainInput(
  input: ExplainLearningTermRequest
): ExplainLearningTermRequest {
  return {
    ...input,
    term: input.term.trim().slice(0, 120),
    text: normalizeSourceText(input.text),
    shortDefinition: input.shortDefinition?.trim().slice(0, 180),
  };
}

function explanationCacheKey(input: ExplainLearningTermRequest): string {
  return [
    CACHE_VERSION,
    'explain',
    learningTermTextHash(input.term),
    learningTermTextHash(input.text),
  ].join(':');
}

function readStoredExplanation(key: string): ExplainLearningTermResponse | null {
  const parsed = ExplainLearningTermResponseDto.safeParse(readStoredValue(key));
  return parsed.success ? parsed.data : null;
}

function readStoredValue(key: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Кэш необязателен: Safari Private Mode и quota errors не должны ломать UI.
  }
}

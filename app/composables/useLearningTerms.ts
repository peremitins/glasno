import { z } from 'zod';
import {
  ExplainLearningTermResponseDto,
  LearningTermCandidateDto,
} from '@/shared/dto';
import type {
  ExplainLearningTermRequest,
  ExplainLearningTermResponse,
  ExtractLearningTermsItemRequest,
  ExtractLearningTermsRequest,
  ExtractLearningTermsResponse,
  LearningTermCandidate,
  LearningTermContext,
} from '@/shared/dto';

// v2: ключи кэша больше не включают контекст — термины зависят от текста,
// а не от того, на каком экране он показан.
const CACHE_VERSION = 'learning-terms-v2';
const MAX_SOURCE_TEXT_LENGTH = 2_000;
const StoredTermsDto = z.array(LearningTermCandidateDto);
const extractMemoryCache = new Map<string, LearningTermCandidate[]>();
const explanationMemoryCache = new Map<string, ExplainLearningTermResponse>();
let sharedBatcher: ReturnType<typeof createLearningTermsBatcher> | null = null;

type ExtractRequest = (
  input: ExtractLearningTermsRequest
) => Promise<ExtractLearningTermsResponse>;

interface BatcherEntry {
  item: ExtractLearningTermsItemRequest;
  resolve: (value: LearningTermCandidate[]) => void;
  reject: (reason: unknown) => void;
}

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

export function createLearningTermsBatcher(params: {
  requestExtract: ExtractRequest;
  debounceMs?: number;
}) {
  const debounceMs = params.debounceMs ?? 260;
  const queue: BatcherEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  }

  async function flush() {
    const entries = queue.splice(0, 8);
    if (!entries.length) return;
    if (queue.length) schedule();

    try {
      const response = await params.requestExtract({
        items: entries.map((entry) => entry.item),
      });
      const termsById = new Map(
        response.items.map((item) => [item.id, item.terms])
      );
      for (const entry of entries) {
        entry.resolve(termsById.get(entry.item.id) ?? []);
      }
    } catch (err) {
      // Ошибка не равна «терминов нет»: пробрасываем её вызывающему коду,
      // чтобы пустой результат не осел в кэше навсегда.
      for (const entry of entries) {
        entry.reject(err);
      }
    }
  }

  return {
    enqueue(item: ExtractLearningTermsItemRequest) {
      return new Promise<LearningTermCandidate[]>((resolve, reject) => {
        queue.push({ item, resolve, reject });
        schedule();
      });
    },
  };
}

export function useLearningTerms() {
  const api = useAPI();
  const activeTermKey = useState<string | null>(
    'learning-terms-active-key',
    () => null
  );

  function getBatcher() {
    if (!sharedBatcher) {
      sharedBatcher = createLearningTermsBatcher({
        requestExtract(input) {
          return api<ExtractLearningTermsResponse>('/api/learning/terms/extract', {
            method: 'POST',
            body: input,
          });
        },
      });
    }
    return sharedBatcher;
  }

  async function extractTermsForText(params: {
    text: string;
    context: LearningTermContext;
  }): Promise<LearningTermCandidate[]> {
    if (typeof window === 'undefined') return [];
    const text = normalizeSourceText(params.text);
    if (text.length < 2) return [];

    const key = extractCacheKey(text);
    const cached = extractMemoryCache.get(key) ?? readStoredTerms(key);
    if (cached) {
      extractMemoryCache.set(key, cached);
      return cached;
    }

    const terms = await getBatcher().enqueue({
      id: `${learningTermTextHash(text)}-${learningTermTextHash(
        learningTermContextKey(params.context)
      )}`,
      text,
      context: params.context,
    });
    extractMemoryCache.set(key, terms);
    writeStoredValue(key, terms);
    return terms;
  }

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
    extractTermsForText,
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

function extractCacheKey(text: string): string {
  return [CACHE_VERSION, 'extract', learningTermTextHash(text)].join(':');
}

function explanationCacheKey(input: ExplainLearningTermRequest): string {
  return [
    CACHE_VERSION,
    'explain',
    learningTermTextHash(input.term),
    learningTermTextHash(input.text),
  ].join(':');
}

function readStoredTerms(key: string): LearningTermCandidate[] | null {
  const parsed = StoredTermsDto.safeParse(readStoredValue(key));
  return parsed.success ? parsed.data : null;
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

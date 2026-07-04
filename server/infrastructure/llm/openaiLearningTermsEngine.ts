import type {
  ExplainLearningTermRequest,
  ExplainLearningTermResponse,
  ExtractLearningTermsRequest,
  ExtractLearningTermsResponse,
  LearningTermCandidate,
} from '@/shared/dto';
import type {
  LearningTermsEngine,
  LearningTermsEngineUsageContext,
} from '@/server/interface/learningTermsEngine';
import type { RecordAiUsageInput } from '@/server/application/aiUsage/aiUsageService';
import { apiError } from '@/server/utils/errors';
import {
  extractResponsesText,
  extractUsageAmounts,
  parseJsonObject,
} from './openaiInterviewEngine';
import {
  sendOpenAiResponsesRequest,
  type OpenAiResponsesPurpose,
} from './openaiResponsesClient';
import { compactGeneratedText } from './textNormalization';

const MAX_EXTRACTED_TERMS = 3;

function findPhraseInText(text: string, phrase: string): string | null {
  const needle = phrase.trim();
  if (!needle) return null;
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return null;
  return text.slice(index, index + needle.length);
}

export function normalizeLearningTermsForText(
  text: string,
  value: unknown
): LearningTermCandidate[] {
  const raw =
    value && typeof value === 'object'
      ? (value as { terms?: unknown })
      : { terms: value };
  const source = Array.isArray(raw.terms) ? raw.terms : [];
  const result: LearningTermCandidate[] = [];
  const seen = new Set<string>();

  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const term = item as {
      phrase?: unknown;
      shortDefinition?: unknown;
      definition?: unknown;
    };
    const phraseCandidate = typeof term.phrase === 'string' ? term.phrase : '';
    const phrase = findPhraseInText(text, phraseCandidate);
    if (!phrase) continue;

    const key = phrase.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const shortDefinition = compactGeneratedText(
      term.shortDefinition ?? term.definition,
      `${phrase} — понятие из текущего текста.`,
      180
    );
    result.push({ phrase, shortDefinition });
    if (result.length >= MAX_EXTRACTED_TERMS) break;
  }

  return result;
}

export function normalizeLearningTermExplanation(
  term: string,
  fallbackShortDefinition: string,
  value: unknown
): ExplainLearningTermResponse {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return {
    term,
    title: compactGeneratedText(raw.title, term, 120),
    shortDefinition: compactGeneratedText(
      raw.shortDefinition,
      fallbackShortDefinition || `${term} — понятие из текущего текста.`,
      180
    ),
    explanation: compactGeneratedText(
      raw.explanation,
      fallbackShortDefinition || `${term} — понятие из текущего текста.`,
      900
    ),
  };
}

export class OpenAiLearningTermsEngine implements LearningTermsEngine {
  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      organization?: string | null;
      project?: string | null;
      recordUsage?: (input: RecordAiUsageInput) => void;
    }
  ) {}

  async extractTerms(
    input: ExtractLearningTermsRequest,
    usageContext?: LearningTermsEngineUsageContext
  ): Promise<ExtractLearningTermsResponse> {
    const raw = await this.requestJson({
      instruction: buildExtractInstruction(),
      userText: JSON.stringify({
        items: input.items.map((item) => ({
          id: item.id,
          text: item.text,
          context: item.context,
        })),
      }),
      maxOutputTokens: Math.min(1800, 280 + input.items.length * 220),
      kind: 'learning_terms_extract',
      context: usageContextFromExtract(input, usageContext),
    });

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    return {
      items: input.items.map((item) => {
        const rawItem = rawItems.find(
          (candidate) =>
            candidate &&
            typeof candidate === 'object' &&
            (candidate as { id?: unknown }).id === item.id
        );
        return {
          id: item.id,
          terms: normalizeLearningTermsForText(item.text, rawItem),
        };
      }),
    };
  }

  async explainTerm(
    input: ExplainLearningTermRequest,
    usageContext?: LearningTermsEngineUsageContext
  ): Promise<ExplainLearningTermResponse> {
    const raw = await this.requestJson({
      instruction: buildExplainInstruction(),
      userText: JSON.stringify({
        term: input.term,
        text: input.text,
        shortDefinition: input.shortDefinition || '',
        context: input.context,
      }),
      maxOutputTokens: 700,
      kind: 'learning_term_explain',
      context: usageContextFromExplain(input, usageContext),
    });

    return normalizeLearningTermExplanation(
      input.term,
      input.shortDefinition || '',
      raw
    );
  }

  private async requestJson(params: {
    instruction: string;
    userText: string;
    maxOutputTokens: number;
    kind: OpenAiResponsesPurpose | string;
    context: {
      userId: string | null;
      anonymousSessionId: string | null;
      interviewSessionId: string | null;
    };
  }): Promise<Record<string, unknown>> {
    if (!this.options.apiKey) {
      throw apiError('E_UPSTREAM', 'Провайдер обработки не настроен');
    }

    const startedAt = Date.now();
    try {
      const response = await sendOpenAiResponsesRequest<unknown>({
        purpose: params.kind,
        timeoutMs: 30_000,
        apiKey: this.options.apiKey,
        organization: this.options.organization,
        project: this.options.project,
        body: {
          model: this.options.model,
          max_output_tokens: params.maxOutputTokens,
          input: [
            {
              role: 'developer',
              content: [{ type: 'input_text', text: params.instruction }],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: params.userText }],
            },
          ],
        },
      });

      if (this.options.recordUsage) {
        const usage = extractUsageAmounts(response);
        this.options.recordUsage({
          ...params.context,
          kind: params.kind,
          model: this.options.model,
          ...usage,
          latencyMs: Date.now() - startedAt,
          requestId: getOpenAiResponseId(response),
        });
      }

      return parseJsonObject(extractResponsesText(response));
    } catch (err) {
      if (err && typeof err === 'object' && 'data' in err) throw err;
      throw apiError('E_UPSTREAM', 'Не удалось обработать термин', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function getOpenAiResponseId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const id = (response as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

function buildExtractInstruction(): string {
  return [
    'Ты помощник в тренажёре собеседований. Найди в каждом фрагменте 0–3 понятия или словосочетания, которые кандидату может быть полезно быстро уточнить.',
    'Часто лучший ответ — пустой список. Если отдельная справка по фразе не добавит пользователю ясности, верни terms: [].',
    'Выделяй только фразы, которые есть в тексте дословно. Не добавляй темы из головы и не переформулируй найденные фразы.',
    'Оцени сложность относительно контекста вопроса, уровня ожидаемой роли и предметной области. Выбирай только специальные понятия, для понимания которых нужно знание конкретной технологии, метрики, стандарта, методологии, протокола, юридического/безопасностного или инженерного концепта.',
    'Не выбирай общеупотребимые слова, бытовые или деловые формулировки, а также широкие названия инструментов сами по себе, если их смысл очевиден без отдельной справки.',
    'Если сомневаешься между подсветить и не подсветить, не подсвечивай.',
    'Для каждого термина дай короткое определение до 180 символов на русском.',
    'Верни строго JSON без markdown: {"items":[{"id":"...","terms":[{"phrase":"точная фраза из текста","shortDefinition":"..."}]}]}',
  ].join('\n');
}

function buildExplainInstruction(): string {
  return [
    'Ты объясняешь термин пользователю тренажёра собеседований.',
    'Объясни понятие простым языком, в контексте исходного фрагмента.',
    'Не пиши готовый ответ кандидата на весь вопрос и не добавляй выдуманный опыт кандидата.',
    'Верни строго JSON без markdown: {"title":"...","shortDefinition":"...","explanation":"2–5 предложений"}',
  ].join('\n');
}

function usageContextFromExtract(
  input: ExtractLearningTermsRequest,
  usageContext?: LearningTermsEngineUsageContext
) {
  const item = input.items.find((candidate) => candidate.context.interviewSessionId);
  return {
    userId: usageContext?.userId ?? null,
    anonymousSessionId: usageContext?.anonymousSessionId ?? null,
    interviewSessionId: item?.context.interviewSessionId ?? null,
  };
}

function usageContextFromExplain(
  input: ExplainLearningTermRequest,
  usageContext?: LearningTermsEngineUsageContext
) {
  return {
    userId: usageContext?.userId ?? null,
    anonymousSessionId: usageContext?.anonymousSessionId ?? null,
    interviewSessionId: input.context.interviewSessionId ?? null,
  };
}

import type {
  ExplainLearningTermRequest,
  ExplainLearningTermResponse,
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

function compactContextForPrompt(context: {
  kind: string;
  label?: string;
}): { kind: string; label?: string } {
  return {
    kind: context.kind,
    ...(context.label ? { label: context.label } : {}),
  };
}

// GPT-5-серия — reasoning-модели: без effort=minimal весь бюджет
// max_output_tokens уходит в reasoning-токены, ответ приходит со
// status=incomplete и пустым текстом (в проде это выглядело как массовые 502).
// Модели вне GPT-5-серии (например, gpt-4.1-nano) параметр reasoning не
// принимают — им его не отправляем.
function supportsReasoningEffort(model: string): boolean {
  return model.startsWith('gpt-5');
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
        context: compactContextForPrompt(input.context),
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
          ...(supportsReasoningEffort(this.options.model)
            ? { reasoning: { effort: 'minimal' } }
            : {}),
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

function buildExplainInstruction(): string {
  return [
    'Ты объясняешь термин пользователю тренажёра собеседований.',
    'Объясни понятие простым языком, в контексте исходного фрагмента.',
    'Не пиши готовый ответ кандидата на весь вопрос и не добавляй выдуманный опыт кандидата.',
    'Верни строго JSON без markdown: {"title":"...","shortDefinition":"...","explanation":"2–5 предложений"}',
  ].join('\n');
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

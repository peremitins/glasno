import { $fetch } from 'ofetch';
import { apiError } from '@/server/utils/errors';
import type {
  EvaluateAnswerParams,
  GenerateQuestionParams,
  InterviewEngine,
} from '@/server/interface/interviewEngine';
import type {
  InterviewSessionRecord,
  InterviewTurnRecord,
} from '@/server/interface/interviewRepository';
import type { RecordAiUsageInput } from '@/server/application/aiUsage/aiUsageService';

// Извлекает usage из ответа Responses API в наши поля.
export function extractUsageAmounts(response: any): {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
} {
  const usage = response?.usage || {};
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
    cachedInputTokens: Number(cached),
    outputTokens: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
  };
}

function usageContext(session: InterviewSessionRecord) {
  return {
    userId: session.userId,
    anonymousSessionId: session.anonymousSessionId,
    interviewSessionId: session.id,
  };
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4o-mini';

export function extractResponsesText(response: any): string {
  const chunks: string[] = [];
  if (typeof response?.output_text === 'string') {
    chunks.push(response.output_text);
  }

  for (const output of response?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (
        (content?.type === 'output_text' || content?.type === 'text') &&
        typeof content.text === 'string'
      ) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join('').trim();
}

export function parseJsonObject(raw: string): Record<string, any> {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? extractObjectCandidate(trimmed);
  return JSON.parse(candidate);
}

function extractObjectCandidate(value: string): string {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end < start) return value;
  return value.slice(start, end + 1);
}

function formatTurns(turns: InterviewTurnRecord[]): string {
  if (!turns.length) return 'Пока нет предыдущих вопросов.';
  return turns
    .map((turn) => {
      const answer = turn.answerTranscript
        ? `\nОтвет: ${turn.answerTranscript}`
        : '';
      return `#${turn.index} [${turn.kind}] ${turn.question}${answer}`;
    })
    .join('\n\n');
}

function sessionContext(params: GenerateQuestionParams | EvaluateAnswerParams) {
  const { session } = params;
  return [
    `Роль: ${session.role || 'не указана'}`,
    `Уровень: ${session.level || 'middle'}`,
    `Режим интервьюера: ${session.interviewerMode}`,
    `Язык: ${session.language}`,
    `Компания: ${session.companyName || 'не указана'}`,
    `Вакансия: ${session.vacancyTitle || 'не указана'}`,
    `Описание вакансии: ${session.vacancyRaw || 'нет'}`,
    `Резюме кандидата: ${session.resumeRaw || 'нет'}`,
  ].join('\n');
}

export class OpenAiInterviewEngine implements InterviewEngine {
  constructor(
    private readonly options: {
      apiKey: string;
      model?: string;
      organization?: string | null;
      project?: string | null;
      recordUsage?: (input: RecordAiUsageInput) => void;
    }
  ) {}

  async generateQuestion(
    params: GenerateQuestionParams
  ): Promise<{ question: string }> {
    const raw = await this.requestJson({
      instruction:
        'Ты профессиональный интервьюер. Сгенерируй следующий краткий вопрос для собеседования. Не повторяй предыдущие вопросы. Верни строго JSON вида {"question":"..."}',
      userText: `${sessionContext(params)}\n\nИстория:\n${formatTurns(params.turns)}`,
      maxOutputTokens: 220,
      kind: 'question_gen',
      context: usageContext(params.session),
    });

    const question = typeof raw.question === 'string' ? raw.question.trim() : '';
    if (!question) {
      throw apiError('E_UPSTREAM', 'OpenAI не вернул текст вопроса');
    }
    return { question };
  }

  async evaluateAnswer(params: EvaluateAnswerParams): Promise<{
    needsClarification: boolean;
    question?: string;
    reason?: string;
  }> {
    const raw = await this.requestJson({
      instruction:
        'Оцени ответ кандидата. Если ответ содержательный, но слишком общий (без фактов, чисел или конкретного примера), задай ОДИН короткий уточняющий вопрос. ' +
        'Если ответ бессмысленный, набор символов, односложный, «не знаю» или ответ достаточный — уточнение НЕ нужно (needsClarification=false). ' +
        'Верни строго JSON вида {"needsClarification":true,"question":"...","reason":"..."} или {"needsClarification":false,"reason":"..."}.',
      userText: `${sessionContext(params)}\n\nВопрос: ${params.turn.question}\nОтвет: ${params.answer}\n\nИстория:\n${formatTurns(params.turns)}`,
      maxOutputTokens: 220,
      kind: 'answer_eval',
      context: usageContext(params.session),
    });

    return {
      needsClarification: Boolean(raw.needsClarification),
      question: typeof raw.question === 'string' ? raw.question.trim() : undefined,
      reason: typeof raw.reason === 'string' ? raw.reason : undefined,
    };
  }

  private async requestJson(params: {
    instruction: string;
    userText: string;
    maxOutputTokens: number;
    kind: string;
    context: {
      userId: string | null;
      anonymousSessionId: string;
      interviewSessionId: string;
    };
  }): Promise<Record<string, any>> {
    if (!this.options.apiKey) {
      throw apiError('E_UPSTREAM', 'NUXT_OPENAI_API_KEY не задан');
    }

    const model = this.options.model || DEFAULT_MODEL;
    const startedAt = Date.now();
    try {
      const response: any = await $fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        timeout: 30_000,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          ...(this.options.organization
            ? { 'OpenAI-Organization': this.options.organization }
            : {}),
          ...(this.options.project
            ? { 'OpenAI-Project': this.options.project }
            : {}),
        },
        body: {
          model,
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
          model,
          ...usage,
          latencyMs: Date.now() - startedAt,
          requestId: typeof response?.id === 'string' ? response.id : null,
        });
      }

      return parseJsonObject(extractResponsesText(response));
    } catch (err) {
      if (err && typeof err === 'object' && 'data' in err) throw err;
      throw apiError('E_UPSTREAM', 'OpenAI не смог сгенерировать вопрос', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

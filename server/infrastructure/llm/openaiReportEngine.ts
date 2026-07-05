import { ReportAnalysisDto, type ReportAnalysis } from '@/shared/dto';
import type {
  AnalyzeReportParams,
  ReportEngine,
} from '@/server/interface/reportEngine';
import { apiError } from '@/server/utils/errors';
import type { RecordAiUsageInput } from '@/server/application/aiUsage/aiUsageService';
import {
  extractResponsesText,
  extractUsageAmounts,
  parseJsonObject,
} from './openaiInterviewEngine';
import { sendOpenAiResponsesRequest } from './openaiResponsesClient';

export function extractReportJson(response: any): Record<string, any> {
  return parseJsonObject(extractResponsesText(response));
}

// JSON Schema для structured outputs (strict). Гарантирует форму ответа на
// стороне OpenAI: до этого модель «угадывала» структуру по текстовому промпту
// и периодически возвращала recommendations массивом или теряла поля — отчёт
// падал на Zod-валидации. question/answer модель НЕ возвращает: сервер сам
// подставляет их из транскрипта по turnId (см. attachQuestionsToAnalysis) —
// меньше выходных токенов и нет риска искажения исходных формулировок.
const CRITERIA_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    structure: { type: 'integer', minimum: 0, maximum: 100 },
    specificity: { type: 'integer', minimum: 0, maximum: 100 },
    relevance: { type: 'integer', minimum: 0, maximum: 100 },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    riskPhrases: { type: 'integer', minimum: 0, maximum: 100 },
    brevity: { type: 'integer', minimum: 0, maximum: 100 },
  },
  required: [
    'structure',
    'specificity',
    'relevance',
    'confidence',
    'riskPhrases',
    'brevity',
  ],
} as const;

export const REPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overallScore: { type: 'integer', minimum: 0, maximum: 100 },
    verdict: { type: 'string' },
    summary: { type: 'string' },
    criteria: CRITERIA_JSON_SCHEMA,
    recommendations: {
      type: 'object',
      additionalProperties: false,
      properties: {
        topFixes: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 5,
        },
      },
      required: ['topFixes'],
    },
    questionAnalysis: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          turnId: { type: 'string' },
          kind: { type: 'string', enum: ['main', 'clarification'] },
          criteria: CRITERIA_JSON_SCHEMA,
          whatWorked: { type: 'string' },
          whatWeak: { type: 'string' },
          modelAnswer: { type: 'string' },
          strongerAnswerStar: { type: 'string' },
          nextPractice: { type: 'string' },
        },
        required: [
          'turnId',
          'kind',
          'criteria',
          'whatWorked',
          'whatWeak',
          'modelAnswer',
          'strongerAnswerStar',
          'nextPractice',
        ],
      },
    },
  },
  required: [
    'overallScore',
    'verdict',
    'summary',
    'criteria',
    'recommendations',
    'questionAnalysis',
  ],
} as const;

// Модель возвращает разбор без текстов вопросов/ответов — подставляем их из
// транскрипта по turnId, чтобы в отчёте были исходные формулировки из БД.
export function attachQuestionsToAnalysis(
  parsed: Record<string, unknown>,
  turns: AnalyzeReportParams['turns']
): Record<string, unknown> {
  if (!Array.isArray(parsed.questionAnalysis)) return parsed;

  const turnById = new Map(turns.map((turn) => [turn.id, turn]));
  return {
    ...parsed,
    questionAnalysis: parsed.questionAnalysis.map((item: unknown) => {
      const record =
        item && typeof item === 'object'
          ? (item as Record<string, unknown>)
          : {};
      const turn =
        typeof record.turnId === 'string'
          ? turnById.get(record.turnId)
          : undefined;
      return {
        ...record,
        question: turn?.question ?? '',
        answer: turn?.answerTranscript ?? '',
      };
    }),
  };
}

export class OpenAiReportEngine implements ReportEngine {
  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      organization?: string | null;
      project?: string | null;
      recordUsage?: (input: RecordAiUsageInput) => void;
    }
  ) {}

  async analyze(params: AnalyzeReportParams): Promise<ReportAnalysis> {
    if (!this.options.apiKey) {
      throw apiError('E_UPSTREAM', 'Провайдер обработки не настроен');
    }

    const startedAt = Date.now();
    try {
      const response = await sendOpenAiResponsesRequest<any>({
        purpose: 'report',
        timeoutMs: 45_000,
        apiKey: this.options.apiKey,
        organization: this.options.organization,
        project: this.options.project,
        body: {
          model: this.options.model,
          // 5000 не хватало: при 6+ вопросах с развёрнутыми modelAnswer вывод
          // обрезался ровно на лимите и JSON не парсился.
          max_output_tokens: 16_000,
          text: {
            format: {
              type: 'json_schema',
              name: 'interview_report',
              strict: true,
              schema: REPORT_JSON_SCHEMA,
            },
          },
          input: [
            {
              role: 'developer',
              content: [
                {
                  type: 'input_text',
                  text: buildInstruction(),
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: buildUserPayload(params),
                },
              ],
            },
          ],
        },
      });

      if (this.options.recordUsage) {
        const usage = extractUsageAmounts(response);
        this.options.recordUsage({
          userId: params.session.userId,
          anonymousSessionId: params.session.anonymousSessionId,
          interviewSessionId: params.session.id,
          kind: 'report',
          model: this.options.model,
          ...usage,
          latencyMs: Date.now() - startedAt,
          requestId: typeof response?.id === 'string' ? response.id : null,
        });
      }

      const parsed = attachQuestionsToAnalysis(
        extractReportJson(response),
        params.turns
      );
      return ReportAnalysisDto.parse({
        ...parsed,
        model: this.options.model,
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'data' in err) throw err;
      throw apiError('E_UPSTREAM', 'Не удалось сформировать отчёт', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function buildInstruction(): string {
  return [
    'Ты карьерный коуч и интервьюер. Разбери завершённое собеседование на русском языке.',
    'Оцени критерии от 0 до 100: structure, specificity, relevance, confidence, riskPhrases, brevity.',
    'riskPhrases — высокий балл означает, что риск-фраз мало.',
    'Для каждого основного и уточняющего вопроса из транскрипта верни отдельный элемент questionAnalysis. Сохраняй исходные turnId и kind.',
    'Для каждого questionAnalysis обязательно проставь criteria по тем же шести критериям от 0 до 100.',
    'Если ответ не предоставлен или он несодержательный, поставь по этому вопросу все criteria в 0 и прямо укажи, что вопрос пропущен.',
    'Для каждого вопроса обязательно дай modelAnswer — сильный возможный вариант ответа, 3–6 предложений, по структуре STAR (ситуация, задача, действие, результат), от первого лица.',
    'Не выдумывай факты, цифры, названия компаний, сроки, метрики и результаты. Используй только данные из вакансии, резюме и ответа кандидата; если фактов не хватает, прямо напиши, какую реальную деталь кандидату нужно добавить.',
    'Пример сильного ответа должен улучшать структуру и формулировки, но не должен создавать ложное впечатление о фактическом опыте кандидата.',
    'Не используй многоточия, квадратные скобки, незавершённые списки и служебные заглушки.',
    'whatWorked всегда должен быть непустым. Если сильных сторон нет, используй ровно фразу: Сильных элементов в ответе не выявлено.',
    'strongerAnswerStar должен быть законченным: 2–4 предложения или четыре понятные части Ситуация, Задача, Действия, Результат, без многоточий.',
    'Каждый элемент questionAnalysis содержит kind "main" или "clarification" — тот же, что у вопроса в транскрипте.',
    'recommendations.topFixes — от 1 до 5 самых важных правок, каждая одним конкретным действием.',
  ].join('\n');
}

function buildUserPayload(params: AnalyzeReportParams): string {
  const { session, turns } = params;
  const transcript = turns
    .map(
      (turn) => {
        const kindLabel =
          turn.kind === 'clarification' ? 'уточняющий' : 'основной';
        return [
          `turnId=${turn.id}`,
          `kind=${turn.kind}`,
          turn.followUpForTurnId
            ? `followUpForTurnId=${turn.followUpForTurnId}`
            : '',
          `Вопрос ${turn.index} (${kindLabel}): ${turn.question}`,
          `Ответ: ${turn.answerTranscript || 'Ответ не предоставлен.'}`,
        ]
          .filter(Boolean)
          .join('\n');
      }
    )
    .join('\n\n');

  return [
    `Роль: ${session.role || 'не указана'}`,
    `Уровень: ${session.level || 'middle'}`,
    `Вакансия: ${session.vacancyTitle || 'не указана'}`,
    `Компания: ${session.companyName || 'не указана'}`,
    `Описание вакансии: ${session.vacancyRaw || 'нет'}`,
    `Резюме: ${session.resumeRaw || 'нет'}`,
    '',
    'Транскрипт:',
    transcript,
  ].join('\n');
}

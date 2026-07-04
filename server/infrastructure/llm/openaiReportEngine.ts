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
          max_output_tokens: 5000,
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

      const parsed = extractReportJson(response);
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
    'Верни строго JSON-объект без markdown.',
    'Корневые поля: overallScore, verdict, summary, criteria, recommendations, questionAnalysis.',
    'Фрагменты схемы для каждого вопроса: "kind":"main", "kind":"clarification", "criteria":{"structure":80,"specificity":70,"relevance":90,"confidence":78,"riskPhrases":84,"brevity":88}, "whatWorked":"Сильных элементов в ответе не выявлено.", "whatWeak":"Конкретная слабая сторона ответа", "modelAnswer":"Законченный сильный ответ", "strongerAnswerStar":"Законченная STAR-рекомендация", "nextPractice":"Короткое упражнение".',
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

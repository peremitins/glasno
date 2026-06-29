import { $fetch } from 'ofetch';
import {
  ReportAnalysisDto,
  type ReportAnalysis,
} from '@/shared/dto';
import type { ReportEngine } from '@/server/interface/reportEngine';
import type { AnalyzeReportParams } from '@/server/interface/reportEngine';
import { apiError } from '@/server/utils/errors';
import type { RecordAiUsageInput } from '@/server/application/aiUsage/aiUsageService';
import {
  extractResponsesText,
  extractUsageAmounts,
  parseJsonObject,
} from './openaiInterviewEngine';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

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
      throw apiError('E_UPSTREAM', 'NUXT_OPENAI_API_KEY не задан');
    }

    const startedAt = Date.now();
    try {
      const response: any = await $fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        timeout: 45_000,
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
          model: this.options.model,
          max_output_tokens: 2200,
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
      throw apiError('E_UPSTREAM', 'OpenAI не смог сформировать отчёт', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function buildInstruction(): string {
  return [
    'Ты карьерный коуч и интервьюер. Разбери завершённое собеседование на русском языке.',
    'Оцени критерии от 0 до 100: structure, specificity, relevance, confidence, riskPhrases, brevity.',
    'riskPhrases — высокий балл означает, что риск-фраз мало.',
    'Для каждого вопроса обязательно дай modelAnswer — развёрнутый ЭТАЛОННЫЙ ответ (как стоило бы ответить), 3–6 предложений, по структуре STAR, с конкретикой и цифрами, от первого лица.',
    'Верни строго JSON без markdown.',
    'Формат: {"overallScore":82,"verdict":"...","summary":"...","criteria":{"structure":80,"specificity":70,"relevance":90,"confidence":78,"riskPhrases":84,"brevity":88},"recommendations":{"topFixes":["...","...","..."]},"questionAnalysis":[{"turnId":"...","question":"...","answer":"...","whatWorked":"...","whatWeak":"...","modelAnswer":"...","strongerAnswerStar":"...","nextPractice":"..."}]}',
  ].join('\n');
}

function buildUserPayload(params: AnalyzeReportParams): string {
  const { session, turns } = params;
  const transcript = turns
    .filter((turn) => turn.answerTranscript)
    .map(
      (turn) =>
        `turnId=${turn.id}\nВопрос ${turn.index} (${turn.kind}): ${turn.question}\nОтвет: ${turn.answerTranscript}`
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

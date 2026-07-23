import {
  ReportAnalysisDto,
  type InterviewTrainingMode,
  type ReportAnalysis,
} from '@/shared/dto';
import type {
  AnalyzeReportParams,
  ReportEngine,
} from '@/server/interface/reportEngine';
import type { InterviewTurnRecord } from '@/server/interface/interviewRepository';
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
    substance: { type: 'integer', minimum: 0, maximum: 100 },
    structure: { type: 'integer', minimum: 0, maximum: 100 },
    delivery: { type: 'integer', minimum: 0, maximum: 100 },
  },
  required: ['substance', 'structure', 'delivery'],
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

// Непрерывное интервьюерское интервью живёт в одном этапе, поэтому связать
// разбор с turnId нельзя: модель сама выделяет фактически заданные вопросы и
// возвращает их тексты вместе с ответами кандидата.
export const REPORT_JSON_SCHEMA_INTERVIEWER_CONTINUOUS = {
  ...REPORT_JSON_SCHEMA,
  properties: {
    ...REPORT_JSON_SCHEMA.properties,
    questionAnalysis: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          turnId: { type: 'string' },
          kind: { type: 'string', enum: ['main'] },
          question: { type: 'string' },
          answer: { type: 'string' },
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
          'question',
          'answer',
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
} as const;

// Модель возвращает разбор без текстов вопросов/ответов — подставляем их из
// транскрипта по turnId, чтобы в отчёте были исходные формулировки из БД.
export function attachQuestionsToAnalysis(
  parsed: Record<string, unknown>,
  turns: AnalyzeReportParams['turns'],
  trainingMode: InterviewTrainingMode = 'candidate'
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
        answer:
          trainingMode === 'interviewer' && turn
            ? formatInterviewerDialogue(turn.metadata) ||
              turn.answerTranscript ||
              ''
            : turn?.answerTranscript ?? '',
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

    const isContinuous = params.analysisMode === 'interviewer_continuous';
    const startedAt = Date.now();
    try {
      const response = await sendOpenAiResponsesRequest<any>({
        purpose: 'report',
        // Отчёт генерируется в фоне, фронт опрашивает статус — ждать можно
        // долго. 45 секунд хватало на 3–6 вопросов фиксированного плана, но в
        // непрерывном интервью разборов столько, сколько вопросов реально
        // задали: длинная беседа упиралась в таймаут, и отчёт падал.
        timeoutMs: 180_000,
        apiKey: this.options.apiKey,
        organization: this.options.organization,
        project: this.options.project,
        body: {
          model: this.options.model,
          // 5000 не хватало: при 6+ вопросах с развёрнутыми modelAnswer вывод
          // обрезался ровно на лимите и JSON не парсился.
          // Потолок вывода ограничивает не только длину, но и время генерации.
          // AI-relay обрывает долгие запросы (502 от nginx), поэтому отчёт
          // должен укладываться в его окно с запасом. 8 разборов JSON'ом —
          // это ~4000 токенов, так что 12 000 остаётся щедрым лимитом.
          max_output_tokens: 12_000,
          text: {
            format: {
              type: 'json_schema',
              name: 'interview_report',
              strict: true,
              schema: isContinuous
                ? REPORT_JSON_SCHEMA_INTERVIEWER_CONTINUOUS
                : REPORT_JSON_SCHEMA,
            },
          },
          input: [
            {
              role: 'developer',
              content: [
                {
                  type: 'input_text',
                  text: isContinuous
                    ? buildContinuousInterviewerInstruction()
                    : buildInstruction(params.session.trainingMode),
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

      // В непрерывном режиме тексты вопросов и ответов приходят от модели —
      // подставлять их из turn'ов нечем и не нужно.
      const parsed = isContinuous
        ? extractReportJson(response)
        : attachQuestionsToAnalysis(
            extractReportJson(response),
            params.turns,
            params.session.trainingMode
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

// Разбор непрерывного интервьюерского интервью: этапов нет, поэтому модель
// сама выделяет фактически заданные вопросы и связывает их с ответами.
export function buildContinuousInterviewerInstruction(): string {
  return [
    buildInstruction('interviewer'),
    '',
    'ВАЖНО: транскрипт — один непрерывный диалог без этапов и без переходов по пунктам плана.',
    'Выдели вопросы, которые пользователь-интервьюер фактически задал, включая реплики без знака вопроса и просьбы рассказать или уточнить, и свяжи каждый с последующим ответом AI-кандидата.',
    'Для каждой пары верни отдельный элемент questionAnalysis: turnId — синтетический идентификатор q1, q2, q3 по порядку, kind — всегда "main".',
    'question — формулировка вопроса пользователя близко к тексту диалога, без переписывания смысла. answer — суть ответа AI-кандидата по этому вопросу.',
    'Приветствия, благодарности, смолток и организационные реплики отдельными вопросами не считай.',
    'Если выделить содержательные пары нельзя, но разговор есть, верни ровно один элемент с turnId "dialogue", question «Ведение интервью» и разбором всего разговора целиком.',
    // Объём вывода растёт вместе с длиной интервью: без потолка длинная беседа
    // упирается в лимит токенов и таймаут, а отчёт из трёх десятков секций
    // всё равно нечитаем.
    'Верни не более 8 элементов questionAnalysis. Если содержательных вопросов было больше, объедини близкие по теме в один разбор и оставь самые значимые для решения по кандидату.',
    'План интервью дан справочно. Темы плана, которые не прозвучали, упомяни в summary и recommendations.topFixes как зоны, которые стоило проверить. НЕ снижай баллы механически за то, что пройдены не все пункты плана: оценивай качество состоявшегося разговора.',
  ].join('\n');
}

export function buildInstruction(
  trainingMode: InterviewTrainingMode = 'candidate'
): string {
  if (trainingMode === 'interviewer') {
    return [
      'Ты тренер интервьюеров Гласно. Разбери завершённую тренировку, где пользователь проводил интервью, а AI играл кандидата.',
      'Оцени три критерия от 0 до 100:',
      'substance (Качество проверки) — проверил ли пользователь релевантные компетенции, опыт, мотивацию и факты по вакансии, вскрыл ли противоречия и собрал ли достаточно доказательств для решения по кандидату, а не только общее впечатление.',
      'structure (Структура) — была ли понятная структура интервью: вступление, ключевые блоки, уточняющие вопросы, логичный переход между темами и завершение.',
      'delivery (Подача) — ясность, уважительный тон, candidate experience, отсутствие рискованных или дискриминационных формулировок.',
      'Оцени именно пользователя-интервьюера. Ответы AI-кандидата используй только как контекст для качества вопросов пользователя.',
      'Проверь, можно ли было обосновать решение по кандидату собранными в разговоре фактами.',
      'Отдельно учитывай качество уточнений: реагировал ли интервьюер на общие, чрезмерно уверенные или противоречивые ответы и отделял ли личный вклад кандидата от вклада команды.',
      'Для каждого основного и уточняющего вопроса из транскрипта верни отдельный элемент questionAnalysis. Сохраняй исходные turnId и kind.',
      'Для каждого questionAnalysis обязательно проставь criteria по тем же трём критериям от 0 до 100.',
      'Если пользователь почти не задавал вопросов или не получил факты, ставь низкие substance и structure и объясняй, чего не хватило.',
      'modelAnswer используй как пример сильного следующего вопроса интервьюера или короткого фрагмента хорошего ведения интервью, а не как ответ кандидата.',
      'whatWorked всегда должен быть непустым. Если сильных сторон нет, используй ровно фразу: Сильных элементов в интервью не выявлено.',
      'strongerAnswerStar должен быть законченным: 2–4 предложения с улучшенной версией вопроса или перехода интервьюера, без многоточий.',
      'Не выдумывай факты, цифры, названия компаний, сроки, метрики и результаты. Используй только вакансию, резюме кандидата и транскрипт.',
      'recommendations.topFixes — от 1 до 5 самых важных действий для улучшения интервью, включая структуру интервью, уточняющие вопросы и candidate experience, если они просели.',
    ].join('\n');
  }

  return [
    'Ты карьерный коуч и интервьюер. Разбери завершённое собеседование на русском языке.',
    'Оцени три критерия от 0 до 100:',
    'substance (Суть ответа) — ответил ли кандидат по существу заданного вопроса, релевантно роли, с конкретикой, личным вкладом и измеримым результатом вместо общих слов.',
    'structure (Структура) — логика изложения: понятны ситуация, задача, действия и результат; ответ связный, без воды и повторов.',
    'delivery (Подача) — уверенность и ясность формулировок, лаконичность, отсутствие риск-фраз, оговорок и слов-паразитов.',
    'Содержание (substance и structure) важнее подачи: не завышай delivery, если ответ пустой или не по делу.',
    'Для каждого основного и уточняющего вопроса из транскрипта верни отдельный элемент questionAnalysis. Сохраняй исходные turnId и kind.',
    'Для каждого questionAnalysis обязательно проставь criteria по тем же трём критериям от 0 до 100.',
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
  const transcript = buildReportTranscript(turns, session.trainingMode);
  const planQuestions = (params.planQuestions ?? []).filter((question) =>
    question.trim()
  );

  return [
    `Роль: ${session.role || 'не указана'}`,
    `Уровень: ${session.level || 'middle'}`,
    `Вакансия: ${session.vacancyTitle || 'не указана'}`,
    `Компания: ${session.companyName || 'не указана'}`,
    `Описание вакансии: ${session.vacancyRaw || 'нет'}`,
    `Резюме: ${session.resumeRaw || 'нет'}`,
    ...(planQuestions.length
      ? [
          '',
          'План интервью (справочник, пользователь не обязан был пройти его целиком):',
          planQuestions
            .map((question, index) => `${index + 1}) ${question}`)
            .join('\n'),
        ]
      : []),
    '',
    'Транскрипт:',
    transcript,
  ].join('\n');
}

type ReportTranscriptTurn = Pick<
  InterviewTurnRecord,
  | 'id'
  | 'index'
  | 'kind'
  | 'question'
  | 'answerTranscript'
  | 'followUpForTurnId'
> & { metadata?: unknown };

function readDialogue(metadata: unknown): Array<{
  role: 'user' | 'interviewer';
  content: string;
}> {
  if (!metadata || typeof metadata !== 'object') return [];
  const dialogue = (metadata as { dialogue?: unknown }).dialogue;
  if (!Array.isArray(dialogue)) return [];

  return dialogue.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as { role?: unknown; content?: unknown };
    if (raw.role !== 'user' && raw.role !== 'interviewer') return [];
    const content = typeof raw.content === 'string' ? raw.content.trim() : '';
    return content ? [{ role: raw.role, content }] : [];
  });
}

function formatInterviewerDialogue(metadata: unknown): string {
  return readDialogue(metadata)
    .map((message) =>
      message.role === 'user'
        ? `Вы: ${message.content}`
        : `AI-кандидат: ${message.content}`
    )
    .join('\n');
}

export function buildReportTranscript(
  turns: ReportTranscriptTurn[],
  trainingMode: InterviewTrainingMode = 'candidate'
): string {
  const isInterviewerTraining = trainingMode === 'interviewer';
  return turns
    .map(
      (turn) => {
        const kindLabel =
          turn.kind === 'clarification' ? 'уточняющий' : 'основной';
        const dialogue = isInterviewerTraining
          ? readDialogue(turn.metadata)
              .map((message) =>
                message.role === 'user'
                  ? `Пользователь-интервьюер: ${message.content}`
                  : `AI-кандидат: ${message.content}`
              )
              .join('\n')
          : '';
        return [
          `turnId=${turn.id}`,
          `kind=${turn.kind}`,
          turn.followUpForTurnId
            ? `followUpForTurnId=${turn.followUpForTurnId}`
            : '',
          `${isInterviewerTraining ? 'Этап' : 'Вопрос'} ${turn.index} (${kindLabel}): ${turn.question}`,
          isInterviewerTraining
            ? [
                `Реплики пользователя-интервьюера: ${
                  turn.answerTranscript || 'Реплики не предоставлены.'
                }`,
                `Полный диалог по этапу:\n${
                  dialogue || 'Полный диалог не сохранён.'
                }`,
              ].join('\n')
            : `Ответ кандидата: ${turn.answerTranscript || 'Ответ не предоставлен.'}`,
        ]
          .filter(Boolean)
          .join('\n');
      }
    )
    .join('\n\n');
}

import { $fetch } from 'ofetch';
import OpenAI from 'openai';
import { apiError } from '@/server/utils/errors';
import type {
  ConverseParams,
  EvaluateAnswerParams,
  GenerateQuestionParams,
  InterviewEngine,
  NormalizeCustomQuestionsParams,
} from '@/server/interface/interviewEngine';
import type {
  InterviewSessionRecord,
  InterviewTurnRecord,
} from '@/server/interface/interviewRepository';
import type { RecordAiUsageInput } from '@/server/application/aiUsage/aiUsageService';
import {
  buildInterviewerGenderInstruction,
  getInterviewerGender,
} from '@/shared/interviewerVoice';
import type { InterviewerFaceId } from '@/shared/dto';

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
  return sessionContextForConverse(params.session);
}

function sessionContextForConverse(session: InterviewSessionRecord) {
  return [
    `Роль: ${session.role || 'не указана'}`,
    `Уровень: ${session.level || 'middle'}`,
    `Режим интервьюера: ${session.interviewerMode}`,
    buildInterviewerGenderInstruction(
      getInterviewerGender(readInterviewerFaceId(session))
    ),
    `Язык: ${session.language}`,
    `Компания: ${session.companyName || 'не указана'}`,
    `Вакансия: ${session.vacancyTitle || 'не указана'}`,
    `Описание вакансии: ${session.vacancyRaw || 'нет'}`,
    `Резюме кандидата: ${session.resumeRaw || 'нет'}`,
  ].join('\n');
}

function readInterviewerFaceId(
  session: InterviewSessionRecord
): InterviewerFaceId | null {
  const value = session.metadata?.interviewerFaceId;
  return typeof value === 'string' ? (value as InterviewerFaceId) : null;
}

// Текст диалога по текущему вопросу для промпта converse/converseStream.
function formatConverseDialogue(params: ConverseParams): string {
  return params.dialogue.length
    ? params.dialogue
        .map(
          (message) =>
            `${message.role === 'user' ? 'Кандидат' : 'Интервьюер'}: ${message.content}`
        )
        .join('\n')
    : 'Кандидат ещё ничего не сказал.';
}

function converseUserText(params: ConverseParams): string {
  return [
    sessionContextForConverse(params.session),
    '',
    `Текущий вопрос: ${params.turn.question}`,
    `Реплик кандидата по этому вопросу: ${params.exchanges}`,
    '',
    `Диалог по текущему вопросу:\n${formatConverseDialogue(params)}`,
  ].join('\n');
}

// Общая часть инструкции интервьюера (без формата вывода).
const CONVERSE_RULES =
  'Ты — интервьюер JobAI, ведёшь живое собеседование голосом и текстом. Веди диалог по ТЕКУЩЕМУ вопросу как живой человек. ' +
  'Реагируй кратко (1–3 предложения), по-русски, в роли интервьюера. ' +
  'Строго соблюдай указанный пол интервьюера и грамматический род в репликах от своего лица. ' +
  'Если кандидат не понял вопрос или просит пояснить — переформулируй вопрос проще, другими словами, приведи пример того, что тебя интересует. ' +
  'Можно задать короткий уточняющий вопрос по ответу. ' +
  'СТРОГО запрещено: отвечать ВМЕСТО кандидата, подсказывать готовый ответ, решать задачу за него — ты проверяешь кандидата, а не учишь. ' +
  'НЕ переходи к следующему вопросу из плана сам и не меняй тему. ' +
  'Решение о переходе принимает пользователь — ты только предлагаешь.';

const CONVERSE_MOVE_ON_RULE =
  'Если кандидат ответил достаточно полно, либо по этому вопросу уже было много реплик, либо он явно «плавает» и продолжать смысла нет — предложи перейти к следующему вопросу (например: «Хорошо, здесь всё понятно. Готовы перейти к следующему вопросу?»).';

const NEXT_MARKER = '<<<NEXT>>>';
const STAY_MARKER = '<<<STAY>>>';
// Запас в хвосте стрима, чтобы маркер перехода никогда не «утёк» в чат,
// даже если разрезан между чанками.
const MARKER_GUARD = 24;

// Отрезает завершающий маркер перехода и хвостовые пробелы, сохраняя
// начало текста без изменений (важно для корректного склеивания чанков).
function splitMoveOnMarker(text: string): {
  clean: string;
  suggestMoveOn: boolean;
} {
  const markerMatch = text.match(/<<<\s*(NEXT|STAY)\s*>>>/i);
  const suggestMoveOn = /<<<\s*NEXT\s*>>>/i.test(text);
  const cut = markerMatch?.index ?? -1;
  const clean = (cut >= 0 ? text.slice(0, cut) : text).replace(/\s+$/, '');
  return { clean, suggestMoveOn };
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

  async normalizeCustomQuestions(
    params: NormalizeCustomQuestionsParams
  ): Promise<{ questions: string[] }> {
    const raw = await this.requestJson({
      instruction:
        'Ты редактор плана интервью JobAI. Из пользовательского текста выдели только вопросы для тренировки собеседования. ' +
        'Убери дубли, мусор, комментарии и слишком общие повторы. Если фраза является просьбой вроде "спроси про конфликт", преврати её в естественный вопрос интервьюера. ' +
        'Не добавляй свои новые темы, если их нет в исходном тексте. Верни строго JSON вида {"questions":["..."]}.',
      userText: [
        `Роль: ${params.role || 'не указана'}`,
        `Уровень: ${params.level || 'middle'}`,
        `Вакансия: ${params.vacancyTitle || 'не указана'}`,
        `Описание вакансии: ${params.vacancyRaw || 'нет'}`,
        `Резюме кандидата: ${params.resumeText || 'нет'}`,
        `Режим источника вопросов: ${params.questionSourceMode || 'mixed'}`,
        '',
        `Пользовательский текст:\n${params.rawText}`,
      ].join('\n'),
      maxOutputTokens: 700,
      kind: 'custom_question_normalize',
      context: {
        userId: params.userId ?? null,
        anonymousSessionId: params.anonymousSessionId,
        interviewSessionId: null,
      },
    });

    const questions = Array.isArray(raw.questions)
      ? raw.questions
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      : [];

    return { questions };
  }

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

  async converse(params: ConverseParams): Promise<{
    reply: string;
    suggestMoveOn: boolean;
  }> {
    const raw = await this.requestJson({
      instruction:
        `${CONVERSE_RULES} ` +
        `${CONVERSE_MOVE_ON_RULE} ` +
        'Если предлагаешь перейти дальше — поставь suggestMoveOn=true, иначе false. ' +
        'Верни строго JSON вида {"reply":"...","suggestMoveOn":true|false}.',
      userText: converseUserText(params),
      maxOutputTokens: 320,
      kind: 'interview_converse',
      context: usageContext(params.session),
    });

    const reply = typeof raw.reply === 'string' ? raw.reply.trim() : '';
    if (!reply) {
      throw apiError('E_UPSTREAM', 'OpenAI не вернул ответ интервьюера');
    }
    return {
      reply,
      suggestMoveOn: Boolean(raw.suggestMoveOn),
    };
  }

  async *converseStream(
    params: ConverseParams
  ): AsyncGenerator<string, { suggestMoveOn: boolean }, void> {
    if (!this.options.apiKey) {
      throw apiError('E_UPSTREAM', 'NUXT_OPENAI_API_KEY не задан');
    }

    const instruction =
      `${CONVERSE_RULES} ` +
      `${CONVERSE_MOVE_ON_RULE} ` +
      'Сначала выдай ТОЛЬКО текст реплики интервьюера (без префиксов и кавычек). ' +
      `В самом конце на отдельной строке поставь ровно один служебный маркер: «${NEXT_MARKER}» — если предлагаешь перейти к следующему вопросу, иначе «${STAY_MARKER}». ` +
      'Маркер — последнее, что ты выводишь; ничего после него не пиши.';

    const model = this.options.model || DEFAULT_MODEL;
    const client = new OpenAI({
      apiKey: this.options.apiKey,
      ...(this.options.organization
        ? { organization: this.options.organization }
        : {}),
      ...(this.options.project ? { project: this.options.project } : {}),
    });

    const startedAt = Date.now();
    let full = '';
    let emitted = 0;
    let completedResponse: any = null;

    try {
      const stream = await client.responses.create({
        model,
        max_output_tokens: 380,
        stream: true,
        input: [
          {
            role: 'developer',
            content: [{ type: 'input_text', text: instruction }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: converseUserText(params) }],
          },
        ],
      } as any);

      for await (const ev of stream as any) {
        if (ev?.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
          full += ev.delta;
          // Не выпускаем последние MARKER_GUARD символов — там может быть маркер.
          const safeLen = full.length - MARKER_GUARD;
          if (safeLen > emitted) {
            yield full.slice(emitted, safeLen);
            emitted = safeLen;
          }
        } else if (
          ev?.type === 'response.completed' ||
          ev?.type === 'response.done'
        ) {
          completedResponse =
            ev?.response && typeof ev.response === 'object' ? ev.response : null;
        } else if (ev?.type === 'response.error') {
          throw apiError(
            'E_UPSTREAM',
            ev?.error?.message || 'OpenAI Realtime stream error'
          );
        }
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'data' in err) throw err;
      throw apiError('E_UPSTREAM', 'OpenAI не смог сгенерировать ответ интервьюера', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    const { clean, suggestMoveOn } = splitMoveOnMarker(full);
    if (!clean) {
      throw apiError('E_UPSTREAM', 'OpenAI вернул пустой ответ интервьюера');
    }
    if (clean.length > emitted) {
      yield clean.slice(emitted);
      emitted = clean.length;
    }

    if (this.options.recordUsage && completedResponse) {
      const usage = extractUsageAmounts(completedResponse);
      this.options.recordUsage({
        ...usageContext(params.session),
        kind: 'interview_converse_stream',
        model,
        ...usage,
        latencyMs: Date.now() - startedAt,
        requestId:
          typeof completedResponse?.id === 'string'
            ? completedResponse.id
            : null,
      });
    }

    return { suggestMoveOn };
  }

  private async requestJson(params: {
    instruction: string;
    userText: string;
    maxOutputTokens: number;
    kind: string;
    context: {
      userId: string | null;
      anonymousSessionId: string;
      interviewSessionId: string | null;
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

import type {
  InterviewReport,
  InterviewTrainingMode,
  ReportAnalysis,
  ReportCriteria,
  ReportQuestionAnalysis,
} from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import { assertOwnedInterviewSession } from '@/server/application/interview/sessionOwnership';
import { logger } from '@/server/utils/logger';
import type {
  InterviewRepository,
  InterviewSessionRecord,
  InterviewTurnRecord,
} from '@/server/interface/interviewRepository';
import type { ReportEngine } from '@/server/interface/reportEngine';
import type {
  ReportRecord,
  ReportRepository,
} from '@/server/interface/reportRepository';

export class ReportService {
  constructor(
    private readonly deps: {
      interviewRepository: Pick<
        InterviewRepository,
        'findSessionById' | 'listTurns'
      >;
      reportRepository: ReportRepository;
      engine: ReportEngine;
    }
  ) {}

  async ensureReport(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<InterviewReport> {
    const generation = await this.prepareReportGeneration(params);
    if (!generation.shouldGenerate) {
      return toReportDto(generation.report, generation.session.trainingMode);
    }

    const processing = await this.deps.reportRepository.markProcessing(
      generation.report.id
    );
    const saved = await this.runReportAnalysis(generation.session, processing.id);
    return toReportDto(saved, generation.session.trainingMode);
  }

  async prepareQueuedReport(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<InterviewReport> {
    const generation = await this.prepareReportGeneration(params);
    return toReportDto(generation.report, generation.session.trainingMode);
  }

  async startReportGeneration(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<InterviewReport> {
    const generation = await this.prepareReportGeneration(params);
    if (!generation.shouldGenerate) {
      return toReportDto(generation.report, generation.session.trainingMode);
    }

    const processing = await this.deps.reportRepository.markProcessing(
      generation.report.id
    );
    void this.runReportAnalysis(generation.session, processing.id).catch((err) => {
      logger.error(
        {
          err,
          reportId: processing.id,
          sessionId: generation.session.id,
        },
        'Не удалось сформировать отчёт в фоновом режиме'
      );
    });

    return toReportDto(processing, generation.session.trainingMode);
  }

  private async prepareReportGeneration(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<{
    session: InterviewSessionRecord;
    report: ReportRecord;
    shouldGenerate: boolean;
  }> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    const existing = await this.deps.reportRepository.findBySessionId(session.id);
    if (existing?.status === 'done' || existing?.status === 'processing') {
      return { session, report: existing, shouldGenerate: false };
    }

    if (session.status !== 'done') {
      throw apiError('E_CONFLICT', 'Сначала завершите интервью, затем сформируйте отчёт');
    }

    const report = existing ?? (await this.deps.reportRepository.createQueued(session.id));
    return { session, report, shouldGenerate: true };
  }

  private async runReportAnalysis(
    session: InterviewSessionRecord,
    reportId: string
  ): Promise<ReportRecord> {
    try {
      const turns = withDialogueAnswerFallback(
        await this.deps.interviewRepository.listTurns(session.id)
      );
      const sanitizedTurns = sanitizeReportTurns(turns);
      const answerCoverage = calculateAnswerCoverage(session, sanitizedTurns);

      if (answerCoverage.answered === 0) {
        const saved = await this.deps.reportRepository.saveCompleted(
          reportId,
          buildZeroAnswerAnalysis(
            answerCoverage.reportTurns,
            session.trainingMode
          )
        );
        return saved;
      }

      const analysis = await this.deps.engine.analyze({
        session,
        turns: sanitizedTurns,
      });
      const adjustedAnalysis = applyAnswerCoverage(
        analysis,
        answerCoverage,
        session.trainingMode
      );
      const saved = await this.deps.reportRepository.saveCompleted(
        reportId,
        adjustedAnalysis
      );
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.deps.reportRepository.saveFailed(reportId, message);
      throw err;
    }
  }

  async getBySession(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<InterviewReport | null> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    const report = await this.deps.reportRepository.findBySessionId(session.id);
    return report ? toReportDto(report, session.trainingMode) : null;
  }

  async getById(params: {
    anonymousSessionId: string;
    userId?: string | null;
    reportId: string;
  }): Promise<InterviewReport> {
    const report = await this.deps.reportRepository.findById(params.reportId);
    if (!report) {
      throw apiError('E_NOT_FOUND', 'Отчёт не найден');
    }
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      report.sessionId,
      params.userId
    );
    return toReportDto(report, session.trainingMode);
  }

  private async requireOwnedSession(
    anonymousSessionId: string,
    sessionId: string,
    userId?: string | null
  ) {
    const session = await this.deps.interviewRepository.findSessionById(sessionId);
    return assertOwnedInterviewSession(session, { anonymousSessionId, userId });
  }
}

function withDialogueAnswerFallback(
  turns: InterviewTurnRecord[]
): InterviewTurnRecord[] {
  return turns.map((turn) => {
    if (turn.kind !== 'main') return turn;
    const directAnswer = normalizeAssessableAnswer(turn.answerTranscript);
    if (directAnswer) return { ...turn, answerTranscript: directAnswer };
    const answer = extractUserDialogueAnswer(turn.metadata);
    return answer ? { ...turn, answerTranscript: answer } : turn;
  });
}

function extractUserDialogueAnswer(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const dialogue = (metadata as { dialogue?: unknown }).dialogue;
  if (!Array.isArray(dialogue)) return '';

  return dialogue
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const raw = item as { role?: unknown; content?: unknown };
      if (raw.role !== 'user') return '';
      return typeof raw.content === 'string' ? raw.content.trim() : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

const ZERO_CRITERIA: ReportCriteria = {
  substance: 0,
  structure: 0,
  delivery: 0,
};

const LOW_EFFORT_REPORT_ANSWER =
  /^(не\s*знаю|незнаю|не\s*уверен(?:а)?|ничего|хз|пропустить|пропуск|skip|нет|—|-|–|\.|…)$/iu;
const DEFAULT_WHAT_WORKED = 'Сильных элементов в ответе не выявлено.';
const DEFAULT_WHAT_WEAK = 'Критичных слабых мест не выявлено.';
const DEFAULT_STRONGER_STAR =
  'Опишите контекст ситуации, цель, свои действия и измеримый результат реальными фактами из опыта.';
const DEFAULT_INTERVIEWER_WHAT_WORKED =
  'Сильных элементов в ведении интервью не выявлено.';
const DEFAULT_INTERVIEWER_WHAT_WEAK =
  'Критичных слабых мест в ведении интервью не выявлено.';
const DEFAULT_INTERVIEWER_STRONGER_QUESTION =
  'Сформулируйте один основной вопрос и добавьте уточнение, которое проверит конкретный опыт, личный вклад и результат кандидата.';

interface AnswerCoverage {
  mainTurns: InterviewTurnRecord[];
  reportTurns: InterviewTurnRecord[];
  answered: number;
  expected: number;
  ratio: number;
}

function sanitizeReportTurns(turns: InterviewTurnRecord[]): InterviewTurnRecord[] {
  return turns.map((turn) => {
    const answer = normalizeAssessableAnswer(turn.answerTranscript);
    return answer === turn.answerTranscript
      ? turn
      : { ...turn, answerTranscript: answer };
  });
}

function normalizeAssessableAnswer(answer: string | null): string | null {
  const text = answer?.trim() ?? '';
  if (!text) return null;
  if (LOW_EFFORT_REPORT_ANSWER.test(text)) return null;

  const words = text.split(/\s+/).filter(Boolean);
  if (text.length < 12 && words.length < 3) return null;

  return text;
}

function calculateAnswerCoverage(
  session: InterviewSessionRecord,
  turns: InterviewTurnRecord[]
): AnswerCoverage {
  const mainTurns = turns.filter((turn) => turn.kind === 'main');
  const reportTurns = turns.filter(
    (turn) => turn.kind === 'main' || turn.kind === 'clarification'
  );
  const answered = mainTurns.filter((turn) =>
    normalizeAssessableAnswer(turn.answerTranscript)
  ).length;
  const expected = Math.max(session.questionCount, mainTurns.length, 1);

  return {
    mainTurns,
    reportTurns,
    answered,
    expected,
    ratio: answered / expected,
  };
}

function buildZeroAnswerAnalysis(
  reportTurns: InterviewTurnRecord[],
  trainingMode: InterviewTrainingMode = 'candidate'
): ReportAnalysis {
  if (trainingMode === 'interviewer') {
    return {
      overallScore: 0,
      verdict:
        'Интервью не состоялось: интервьюер не задал ни одного содержательного вопроса.',
      summary:
        'Диалог с AI-кандидатом не начался, поэтому оценить качество вопросов, уточнений, структуру и подачу интервьюера невозможно.',
      criteria: { ...ZERO_CRITERIA },
      recommendations: {
        topFixes: [
          'Начать с короткого открытого вопроса о релевантном опыте кандидата.',
          'Заранее определить компетенции и факты, которые нужно проверить.',
          'Использовать уточнения, чтобы отделять общий ответ от реального вклада кандидата.',
        ],
      },
      questionAnalysis: buildFallbackQuestionAnalysis(
        reportTurns,
        trainingMode
      ),
    };
  }
  return {
    overallScore: 0,
    verdict: 'Собеседование не состоялось из-за отсутствия содержательных ответов.',
    summary:
      'На вопросы интервью не было дано ни одного содержательного ответа, поэтому оценить кандидата невозможно. Итоговый балл и все критерии установлены в 0.',
    criteria: { ...ZERO_CRITERIA },
    recommendations: {
      topFixes: [
        'Ответить на вопросы интервью, а не пропускать их.',
        'Подготовить ответы на ключевые вопросы по структуре STAR.',
        'Добавлять конкретные примеры, личную роль, цифры и результат.',
      ],
    },
    questionAnalysis: buildFallbackQuestionAnalysis(reportTurns, trainingMode),
  };
}

function applyAnswerCoverage(
  analysis: ReportAnalysis,
  coverage: AnswerCoverage,
  trainingMode: InterviewTrainingMode = 'candidate'
): ReportAnalysis {
  const criteria = scaleCriteria(analysis.criteria, coverage.ratio);
  const normalizedQuestionAnalysis = normalizeQuestionAnalysis(
    analysis.questionAnalysis,
    coverage.reportTurns,
    trainingMode
  );
  const fallbackAnalysis = buildFallbackQuestionAnalysis(
    coverage.reportTurns,
    trainingMode
  );
  const skippedSummary =
    coverage.answered < coverage.expected
      ? trainingMode === 'interviewer'
        ? `Обсуждено ${coverage.answered} из ${coverage.expected} пунктов плана.`
        : `Зачтено ${coverage.answered} из ${coverage.expected} содержательных ответов.`
      : '';

  return {
    ...analysis,
    overallScore: scaleScore(analysis.overallScore, coverage.ratio),
    criteria,
    verdict: skippedSummary
      ? `Оценка снижена: ${skippedSummary} ${analysis.verdict}`
      : analysis.verdict,
    summary: skippedSummary
      ? `Итоговый балл учитывает полноту прохождения: ${skippedSummary} ${analysis.summary}`
      : analysis.summary,
    recommendations: {
      topFixes: prependUnique(
        coverage.answered < coverage.expected
          ? trainingMode === 'interviewer'
            ? [
                `Пройти весь план интервью: сейчас обсуждено ${coverage.answered} из ${coverage.expected} пунктов.`,
              ]
            : [
                `Ответить на все вопросы интервью: сейчас зачтено ${coverage.answered} из ${coverage.expected}.`,
              ]
          : [],
        analysis.recommendations.topFixes
      ).slice(0, 5),
    },
    questionAnalysis: appendMissingQuestionAnalysis(
      normalizedQuestionAnalysis,
      fallbackAnalysis
    ),
  };
}

function scaleCriteria(
  criteria: ReportCriteria,
  ratio: number
): ReportCriteria {
  return {
    substance: scaleScore(criteria.substance, ratio),
    structure: scaleScore(criteria.structure, ratio),
    delivery: scaleScore(criteria.delivery, ratio),
  };
}

function scaleScore(score: number, ratio: number): number {
  return Math.max(0, Math.min(100, Math.round(score * ratio)));
}

function buildFallbackQuestionAnalysis(
  turns: InterviewTurnRecord[],
  trainingMode: InterviewTrainingMode = 'candidate'
): ReportQuestionAnalysis[] {
  const sourceTurns = turns.length
    ? turns
    : [
        {
          id: 'interview_summary',
          kind: 'main',
          question: 'Вопросы интервью',
          answerTranscript: null,
        } as InterviewTurnRecord,
      ];

  return sourceTurns.map((turn) => {
    const answer = normalizeAssessableAnswer(turn.answerTranscript);
    if (!answer) {
      if (trainingMode === 'interviewer') {
        return {
          turnId: turn.id,
          kind: turn.kind,
          question: turn.question,
          answer: 'Вопрос не задан.',
          criteria: cloneCriteria(ZERO_CRITERIA),
          whatWorked:
            'Оценить сильные стороны невозможно: разговора по этому пункту не было.',
          whatWeak:
            'Пункт плана не раскрыт — AI-кандидат не получил вопроса и не смог показать свой опыт.',
          modelAnswer:
            'Сформулируйте один основной вопрос, который проверяет конкретную компетенцию или факт, а затем задайте уточнение по реальному вкладу и результату.',
          strongerAnswerStar:
            'Начните с открытого вопроса, выслушайте ответ и уточните контекст, личную роль, решение и измеримый результат.',
          nextPractice:
            'Сформулируйте основной вопрос и два возможных уточнения к нему.',
        };
      }
      return {
        turnId: turn.id,
        kind: turn.kind,
        question: turn.question,
        answer: 'Ответ не предоставлен.',
        criteria: cloneCriteria(ZERO_CRITERIA),
        whatWorked:
          'Оценить сильные стороны невозможно, потому что ответа на вопрос нет.',
        whatWeak:
          'Вопрос пропущен: нет структуры, конкретики, личной роли и результата.',
        modelAnswer:
          'Сильный ответ стоит построить по STAR: кратко описать ситуацию, задачу, свои действия и измеримый результат. Подберите реальный пример из опыта, добавьте цифры, сроки и вашу личную роль.',
        strongerAnswerStar:
          'Подготовьте пример по STAR: ситуация, задача, действие, результат. Даже короткий ответ должен показывать контекст, ваш вклад и итог.',
        nextPractice:
          'Запишите 2-3 тезиса к этому вопросу и проговорите ответ вслух за 60-90 секунд.',
      };
    }

    if (trainingMode === 'interviewer') {
      return {
        turnId: turn.id,
        kind: turn.kind,
        question: turn.question,
        answer: formatInterviewerDialogue(turn.metadata) || answer,
        criteria: null,
        whatWorked:
          'Разговор сохранён, но отдельный разбор этого пункта не был сформирован.',
        whatWeak:
          'Для точной оценки качества вопроса и уточнений нужно переформировать отчёт.',
        modelAnswer: '',
        strongerAnswerStar:
          'Уточните контекст, личный вклад кандидата, принятое решение и измеримый результат.',
        nextPractice:
          'Переформулируйте основной вопрос и подготовьте два уточнения к возможному общему ответу.',
      };
    }

    return {
      turnId: turn.id,
      kind: turn.kind,
      question: turn.question,
      answer,
      criteria: null,
      whatWorked:
        'Ответ сохранён в структуре отчёта, но отдельный разбор по нему не был сформирован.',
      whatWeak:
        'Для точной оценки этого ответа нужно переформировать отчёт или пройти вопрос повторно.',
      modelAnswer: '',
      strongerAnswerStar:
        'Сформулируйте ответ по STAR: ситуация, задача, действие, результат.',
      nextPractice:
        'Вернитесь к этому вопросу и добавьте 1-2 факта: личную роль, цифру, срок или результат.',
    };
  });
}

function formatInterviewerDialogue(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const dialogue = (metadata as { dialogue?: unknown }).dialogue;
  if (!Array.isArray(dialogue)) return '';
  return dialogue
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const message = item as { role?: unknown; content?: unknown };
      if (typeof message.content !== 'string' || !message.content.trim()) {
        return '';
      }
      const author = message.role === 'interviewer' ? 'AI-кандидат' : 'Вы';
      return `${author}: ${message.content.trim()}`;
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeQuestionAnalysis(
  current: ReportQuestionAnalysis[],
  turns: InterviewTurnRecord[],
  trainingMode: InterviewTrainingMode = 'candidate'
): ReportQuestionAnalysis[] {
  const turnsById = new Map(turns.map((turn) => [turn.id, turn]));
  const whatWorkedFallback =
    trainingMode === 'interviewer'
      ? DEFAULT_INTERVIEWER_WHAT_WORKED
      : DEFAULT_WHAT_WORKED;
  const whatWeakFallback =
    trainingMode === 'interviewer'
      ? DEFAULT_INTERVIEWER_WHAT_WEAK
      : DEFAULT_WHAT_WEAK;
  return current.map((item) => {
    const turn = turnsById.get(item.turnId);
    return {
      ...item,
      kind: item.kind ?? turn?.kind ?? 'main',
      criteria: item.criteria ?? null,
      whatWorked: normalizeReportInsightText(
        item.whatWorked,
        whatWorkedFallback
      ),
      whatWeak: normalizeReportInsightText(item.whatWeak, whatWeakFallback),
      strongerAnswerStar: normalizeStrongerStar(
        item.strongerAnswerStar,
        trainingMode
      ),
    };
  });
}

function normalizeReportInsightText(value: string, fallback: string): string {
  const text = value.trim();
  return text || fallback;
}

function normalizeStrongerStar(
  value: string,
  trainingMode: InterviewTrainingMode = 'candidate'
): string {
  const text = value.trim();
  if (!text || isBrokenStarRecommendation(text)) {
    return trainingMode === 'interviewer'
      ? DEFAULT_INTERVIEWER_STRONGER_QUESTION
      : DEFAULT_STRONGER_STAR;
  }
  return text;
}

function isBrokenStarRecommendation(value: string): boolean {
  const normalized = value.trim();
  return (
    /(?:\.\.\.|…)/u.test(normalized) ||
    /\[[^\]]+\]/u.test(normalized) ||
    /^s\s*\/\s*t\s*\/\s*a\s*\/\s*r\s*:?\s*$/iu.test(normalized) ||
    /^s\s*\/\s*t\s*\/\s*a\s*\/\s*r\s*:?\s*(?:\.\.\.|…)$/iu.test(
      normalized
    )
  );
}

function cloneCriteria(criteria: ReportCriteria): ReportCriteria {
  return { ...criteria };
}

function prependUnique(prefix: string[], values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of [...prefix, ...values]) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function appendMissingQuestionAnalysis(
  current: ReportQuestionAnalysis[],
  missing: ReportQuestionAnalysis[]
): ReportQuestionAnalysis[] {
  if (!missing.length) return current;

  const existingIds = new Set(current.map((item) => item.turnId));
  return [
    ...current,
    ...missing.filter((item) => !existingIds.has(item.turnId)),
  ];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function sanitizeReportErrorMessage(message: string | null): string | null {
  if (!message) return message;
  if (!/openai|chatgpt/i.test(message)) return message;
  return 'Не удалось сформировать отчёт. Попробуйте ещё раз.';
}

function sanitizeReportQuestionAnalysis(
  items: ReportQuestionAnalysis[] | null,
  trainingMode: InterviewTrainingMode
): ReportQuestionAnalysis[] | null {
  if (!items) return items;
  return normalizeQuestionAnalysis(items, [], trainingMode);
}

export function toReportDto(
  report: ReportRecord,
  trainingMode: InterviewTrainingMode = 'candidate'
): InterviewReport {
  return {
    id: report.id,
    sessionId: report.sessionId,
    trainingMode,
    status: report.status,
    overallScore: report.overallScore,
    verdict: report.verdict,
    summary: report.summary,
    criteria: report.criteria,
    recommendations: report.recommendations,
    questionAnalysis: sanitizeReportQuestionAnalysis(
      report.questionAnalysis,
      trainingMode
    ),
    errorMessage: sanitizeReportErrorMessage(report.errorMessage),
    model: report.model,
    createdAt: toIso(report.createdAt),
    updatedAt: toIso(report.updatedAt),
  };
}

import type {
  InterviewReport,
  ReportAnalysis,
  ReportCriteria,
  ReportQuestionAnalysis,
} from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
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
      return toReportDto(generation.report);
    }

    const processing = await this.deps.reportRepository.markProcessing(
      generation.report.id
    );
    const saved = await this.runReportAnalysis(generation.session, processing.id);
    return toReportDto(saved);
  }

  async prepareQueuedReport(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<InterviewReport> {
    const generation = await this.prepareReportGeneration(params);
    return toReportDto(generation.report);
  }

  async startReportGeneration(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<InterviewReport> {
    const generation = await this.prepareReportGeneration(params);
    if (!generation.shouldGenerate) {
      return toReportDto(generation.report);
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

    return toReportDto(processing);
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
          buildZeroAnswerAnalysis(answerCoverage.mainTurns)
        );
        return saved;
      }

      const analysis = await this.deps.engine.analyze({
        session,
        turns: sanitizedTurns,
      });
      const adjustedAnalysis = applyAnswerCoverage(analysis, answerCoverage);
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
    return report ? toReportDto(report) : null;
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
    await this.requireOwnedSession(
      params.anonymousSessionId,
      report.sessionId,
      params.userId
    );
    return toReportDto(report);
  }

  private async requireOwnedSession(
    anonymousSessionId: string,
    sessionId: string,
    userId?: string | null
  ) {
    const session = await this.deps.interviewRepository.findSessionById(sessionId);
    if (!session) {
      throw apiError('E_NOT_FOUND', 'Интервью не найдено');
    }
    const ownedByAnonymousSession = session.anonymousSessionId === anonymousSessionId;
    const ownedByUser = Boolean(userId && session.userId === userId);
    if (!ownedByAnonymousSession && !ownedByUser) {
      throw apiError('E_FORBIDDEN', 'Нет доступа к этому интервью');
    }
    return session;
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
  structure: 0,
  specificity: 0,
  relevance: 0,
  confidence: 0,
  riskPhrases: 0,
  brevity: 0,
};

const LOW_EFFORT_REPORT_ANSWER =
  /^(не\s*знаю|незнаю|не\s*уверен(?:а)?|ничего|хз|пропустить|пропуск|skip|нет|—|-|–|\.|…)$/iu;

interface AnswerCoverage {
  mainTurns: InterviewTurnRecord[];
  skippedMainTurns: InterviewTurnRecord[];
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
  const answered = mainTurns.filter((turn) =>
    normalizeAssessableAnswer(turn.answerTranscript)
  ).length;
  const expected = Math.max(session.questionCount, mainTurns.length, 1);
  const skippedMainTurns = mainTurns.filter(
    (turn) => !normalizeAssessableAnswer(turn.answerTranscript)
  );

  return {
    mainTurns,
    skippedMainTurns,
    answered,
    expected,
    ratio: answered / expected,
  };
}

function buildZeroAnswerAnalysis(
  mainTurns: InterviewTurnRecord[]
): ReportAnalysis {
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
    questionAnalysis: buildSkippedQuestionAnalysis(mainTurns),
  };
}

function applyAnswerCoverage(
  analysis: ReportAnalysis,
  coverage: AnswerCoverage
): ReportAnalysis {
  const criteria = scaleCriteria(analysis.criteria, coverage.ratio);
  const skippedAnalysis = buildSkippedQuestionAnalysis(coverage.skippedMainTurns);
  const skippedSummary =
    coverage.answered < coverage.expected
      ? `Зачтено ${coverage.answered} из ${coverage.expected} содержательных ответов.`
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
          ? [
              `Ответить на все вопросы интервью: сейчас зачтено ${coverage.answered} из ${coverage.expected}.`,
            ]
          : [],
        analysis.recommendations.topFixes
      ).slice(0, 5),
    },
    questionAnalysis: appendMissingQuestionAnalysis(
      analysis.questionAnalysis,
      skippedAnalysis
    ),
  };
}

function scaleCriteria(
  criteria: ReportCriteria,
  ratio: number
): ReportCriteria {
  return {
    structure: scaleScore(criteria.structure, ratio),
    specificity: scaleScore(criteria.specificity, ratio),
    relevance: scaleScore(criteria.relevance, ratio),
    confidence: scaleScore(criteria.confidence, ratio),
    riskPhrases: scaleScore(criteria.riskPhrases, ratio),
    brevity: scaleScore(criteria.brevity, ratio),
  };
}

function scaleScore(score: number, ratio: number): number {
  return Math.max(0, Math.min(100, Math.round(score * ratio)));
}

function buildSkippedQuestionAnalysis(
  turns: InterviewTurnRecord[]
): ReportQuestionAnalysis[] {
  const sourceTurns = turns.length
    ? turns
    : [
        {
          id: 'interview_summary',
          question: 'Вопросы интервью',
        } as InterviewTurnRecord,
      ];

  return sourceTurns.map((turn) => ({
    turnId: turn.id,
    question: turn.question,
    answer: 'Ответ не предоставлен.',
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
  }));
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

export function toReportDto(report: ReportRecord): InterviewReport {
  return {
    id: report.id,
    sessionId: report.sessionId,
    status: report.status,
    overallScore: report.overallScore,
    verdict: report.verdict,
    summary: report.summary,
    criteria: report.criteria,
    recommendations: report.recommendations,
    questionAnalysis: report.questionAnalysis,
    errorMessage: report.errorMessage,
    model: report.model,
    createdAt: toIso(report.createdAt),
    updatedAt: toIso(report.updatedAt),
  };
}

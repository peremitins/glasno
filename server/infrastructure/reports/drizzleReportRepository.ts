import { eq } from 'drizzle-orm';
import type {
  ReportAnalysis,
  ReportCriteria,
  ReportQuestionAnalysis,
  ReportRecommendations,
  ReportStatus,
} from '@/shared/dto';
import { getDb, schema } from '@/server/infrastructure/db/client';
import { canonicalizeEmailForTrial } from '@/server/application/auth/authCrypto';
import { apiError } from '@/server/utils/errors';
import type {
  ReportRecord,
  ReportRepository,
} from '@/server/interface/reportRepository';

type ReportRow = typeof schema.interviewReports.$inferSelect;

function mapReport(row: ReportRow): ReportRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    status: row.status as ReportStatus,
    overallScore: row.overallScore,
    verdict: row.verdict,
    summary: row.summary,
    criteria: row.criteria as ReportCriteria | null,
    recommendations: row.recommendations as ReportRecommendations | null,
    questionAnalysis: row.questionAnalysis as ReportQuestionAnalysis[] | null,
    errorMessage: row.errorMessage,
    model: row.model,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function requireRow<T>(row: T | undefined, action: string): T {
  if (!row) {
    throw apiError('E_UNKNOWN', `База данных не вернула отчёт после ${action}`);
  }
  return row;
}

export class DrizzleReportRepository implements ReportRepository {
  private readonly db = getDb();

  async findById(id: string): Promise<ReportRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.interviewReports)
      .where(eq(schema.interviewReports.id, id))
      .limit(1);
    return row ? mapReport(row) : null;
  }

  async findBySessionId(sessionId: string): Promise<ReportRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.interviewReports)
      .where(eq(schema.interviewReports.sessionId, sessionId))
      .limit(1);
    return row ? mapReport(row) : null;
  }

  async createQueued(sessionId: string): Promise<ReportRecord> {
    const [row] = await this.db
      .insert(schema.interviewReports)
      .values({
        sessionId,
        status: 'queued',
        updatedAt: new Date(),
      })
      .returning();
    return mapReport(requireRow(row, 'создания'));
  }

  async markProcessing(id: string): Promise<ReportRecord> {
    const [row] = await this.db
      .update(schema.interviewReports)
      .set({ status: 'processing', errorMessage: null, updatedAt: new Date() })
      .where(eq(schema.interviewReports.id, id))
      .returning();
    return mapReport(requireRow(row, 'обновления статуса'));
  }

  async saveCompleted(id: string, analysis: ReportAnalysis): Promise<ReportRecord> {
    return await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.interviewReports)
        .set({
          status: 'done',
          overallScore: analysis.overallScore,
          verdict: analysis.verdict,
          summary: analysis.summary,
          criteria: analysis.criteria,
          recommendations: analysis.recommendations,
          questionAnalysis: analysis.questionAnalysis,
          model: analysis.model || null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.interviewReports.id, id))
        .returning();
      const report = requireRow(row, 'сохранения');

      const [session] = await tx
        .select({ userId: schema.interviewSessions.userId })
        .from(schema.interviewSessions)
        .where(eq(schema.interviewSessions.id, report.sessionId))
        .limit(1);
      if (!session?.userId) return mapReport(report);

      const [identity] = await tx
        .select({
          email: schema.users.email,
          telegramId: schema.users.telegramId,
        })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1);
      const email = identity?.email?.trim().toLowerCase() || null;
      const telegramId = identity?.telegramId || null;
      if (email || telegramId) {
        await tx
          .insert(schema.trialInterviewHistory)
          .values({
            userId: session.userId,
            email,
            emailCanonical: email ? canonicalizeEmailForTrial(email) : null,
            telegramId,
          })
          .onConflictDoNothing();
      }

      return mapReport(report);
    });
  }

  async saveFailed(id: string, message: string): Promise<ReportRecord> {
    const [row] = await this.db
      .update(schema.interviewReports)
      .set({
        status: 'failed',
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(schema.interviewReports.id, id))
      .returning();
    return mapReport(requireRow(row, 'сохранения ошибки'));
  }
}

import { and, count, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { getDb, schema } from '@/server/infrastructure/db/client';
import type {
  DashboardRepository,
  DashboardSessionRecord,
} from '@/server/interface/dashboardRepository';
import type { BillingOwner } from '@/server/interface/billingRepository';
import type {
  InterviewLevel,
  InterviewerMode,
  InterviewSessionStatus,
  ReportRecommendations,
  ReportStatus,
} from '@/shared/dto';

function ownerWhere(owner: BillingOwner) {
  if (owner.userId) {
    return eq(schema.interviewSessions.userId, owner.userId);
  }
  return and(
    isNull(schema.interviewSessions.userId),
    eq(schema.interviewSessions.anonymousSessionId, owner.anonymousSessionId)
  );
}

export class DrizzleDashboardRepository implements DashboardRepository {
  private readonly db = getDb();

  async countOwnerFreeSessionsUsed(owner: BillingOwner): Promise<number> {
    const [completedReportCount] = await this.db
      .select({ value: count() })
      .from(schema.interviewReports)
      .innerJoin(
        schema.interviewSessions,
        eq(schema.interviewReports.sessionId, schema.interviewSessions.id)
      )
      .where(
        and(ownerWhere(owner), eq(schema.interviewReports.status, 'done'))
      )
      .limit(1);
    const completedInterviews = Number(completedReportCount?.value ?? 0);
    if (!owner.userId) return completedInterviews;

    const [user] = await this.db
      .select({
        email: schema.users.email,
        telegramId: schema.users.telegramId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, owner.userId))
      .limit(1);
    const email = user?.email?.trim().toLowerCase() || null;
    const telegramId = user?.telegramId || null;
    if (!email && !telegramId) return completedInterviews;

    const [history] = await this.db
      .select({ id: schema.trialInterviewHistory.id })
      .from(schema.trialInterviewHistory)
      .where(
        or(
          email ? eq(schema.trialInterviewHistory.email, email) : sql`false`,
          telegramId
            ? eq(schema.trialInterviewHistory.telegramId, telegramId)
            : sql`false`
        )
      )
      .limit(1);
    return Math.max(completedInterviews, history ? 1 : 0);
  }

  async listOwnerSessions(
    owner: BillingOwner,
    options: { limit?: number } = {}
  ): Promise<DashboardSessionRecord[]> {
    const rows = await this.db
      .select({
        id: schema.interviewSessions.id,
        status: schema.interviewSessions.status,
        vacancyTitle: schema.interviewSessions.vacancyTitle,
        companyName: schema.interviewSessions.companyName,
        role: schema.interviewSessions.role,
        level: schema.interviewSessions.level,
        interviewerMode: schema.interviewSessions.interviewerMode,
        questionCount: schema.interviewSessions.questionCount,
        createdAt: schema.interviewSessions.createdAt,
        reportId: schema.interviewReports.id,
        reportStatus: schema.interviewReports.status,
        reportScore: schema.interviewReports.overallScore,
        reportRecommendations: schema.interviewReports.recommendations,
      })
      .from(schema.interviewSessions)
      .leftJoin(
        schema.interviewReports,
        eq(schema.interviewReports.sessionId, schema.interviewSessions.id)
      )
      .where(ownerWhere(owner))
      .orderBy(desc(schema.interviewSessions.createdAt))
      .limit(options.limit ?? 50);

    const sessionIds = rows.map((row) => row.id);
    const answeredBySession = new Map<string, number>();
    if (sessionIds.length > 0) {
      const answeredRows = await this.db
        .select({
          sessionId: schema.interviewTurns.sessionId,
        })
        .from(schema.interviewTurns)
        .where(andInAnsweredTurns(sessionIds));
      for (const row of answeredRows) {
        answeredBySession.set(
          row.sessionId,
          (answeredBySession.get(row.sessionId) ?? 0) + 1
        );
      }
    }

    return rows.map((row) => ({
      id: row.id,
      status: row.status as InterviewSessionStatus,
      vacancyTitle: row.vacancyTitle,
      companyName: row.companyName,
      role: row.role,
      level: row.level as InterviewLevel | null,
      interviewerMode: (row.interviewerMode || 'neutral') as InterviewerMode,
      questionCount: row.questionCount,
      answeredQuestions: answeredBySession.get(row.id) ?? 0,
      createdAt: row.createdAt,
      report: row.reportId
        ? {
            id: row.reportId,
            status: row.reportStatus as ReportStatus,
            overallScore: row.reportScore,
            recommendations:
              row.reportRecommendations as ReportRecommendations | null,
          }
        : null,
    }));
  }
}

function andInAnsweredTurns(sessionIds: string[]) {
  return and(
    inArray(schema.interviewTurns.sessionId, sessionIds),
    isNotNull(schema.interviewTurns.answerTranscript)
  );
}

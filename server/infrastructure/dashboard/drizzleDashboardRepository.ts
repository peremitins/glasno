import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
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

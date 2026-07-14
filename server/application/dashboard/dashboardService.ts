import type {
  DashboardQuickScenario,
  DashboardSummaryResponse,
  InterviewHistoryItem,
  InterviewHistoryResponse,
} from '@/shared/dto';
import type { BillingOwner } from '@/server/interface/billingRepository';
import type {
  DashboardRepository,
  DashboardSessionRecord,
} from '@/server/interface/dashboardRepository';
import { FREE_SESSIONS_LIMIT } from '@/server/application/billing/plans';

// Универсальные форматы интервью — подходят для любой профессии, поэтому
// роль не задаём: пользователь укажет её (или вакансию) сам на экране
// создания интервью. Плитка задаёт только фокус, уровень и тон интервьюера.
const QUICK_SCENARIOS: DashboardQuickScenario[] = [
  {
    id: 'hr-screening',
    title: 'Разговор с HR',
    subtitle: 'Мотивация, ожидания и первый отсев перед встречей с руководителем.',
    sourceType: 'profession',
    focus: 'hr_screening',
    level: 'middle',
    interviewerMode: 'soft',
  },
  {
    id: 'professional',
    title: 'Вопросы по профессии',
    subtitle: 'Практические задачи и инструменты вашей профессии.',
    sourceType: 'profession',
    focus: 'professional',
    level: 'middle',
    interviewerMode: 'neutral',
  },
  {
    id: 'behavioral',
    title: 'Опыт и кейсы',
    subtitle: 'Истории из работы: ситуация, ваши действия и результат.',
    sourceType: 'profession',
    focus: 'behavioral',
    level: 'middle',
    interviewerMode: 'neutral',
  },
  {
    id: 'salary-negotiation',
    title: 'Зарплата и оффер',
    subtitle: 'Как назвать цифру, обосновать её и ответить на возражения.',
    sourceType: 'profession',
    focus: 'salary_negotiation',
    level: 'middle',
    interviewerMode: 'strict',
  },
];

export class DashboardService {
  constructor(
    private readonly deps: {
      repository: DashboardRepository;
    }
  ) {}

  async getSummary(owner: BillingOwner): Promise<DashboardSummaryResponse> {
    const [sessions, freeSessionsUsed] = await Promise.all([
      this.deps.repository.listOwnerSessions(owner, { limit: 20 }),
      this.deps.repository.countOwnerFreeSessionsUsed(owner),
    ]);
    const items = sessions.map(toHistoryItem);
    const scored = items
      .map((item) => item.report?.overallScore)
      .filter((score): score is number => typeof score === 'number');
    const completed = items.filter((item) => item.status === 'done').length;

    return {
      totals: {
        sessions: items.length,
        completed,
        averageScore:
          scored.length > 0
            ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length)
            : null,
        freeSessionsUsed,
        freeSessionsLimit: FREE_SESSIONS_LIMIT,
      },
      activeSession: items.find((item) => item.status === 'running') ?? null,
      recentSessions: items.slice(0, 4),
      topFixes: latestTopFixes(sessions),
      quickScenarios: QUICK_SCENARIOS,
    };
  }

  async listHistory(owner: BillingOwner): Promise<InterviewHistoryResponse> {
    const sessions = await this.deps.repository.listOwnerSessions(owner, {
      limit: 50,
    });
    return { items: sessions.map(toHistoryItem) };
  }
}

function toHistoryItem(row: DashboardSessionRecord): InterviewHistoryItem {
  const title =
    row.vacancyTitle || row.role || titleByStatus(row.status);
  return {
    id: row.id,
    title,
    subtitle: row.companyName,
    status: row.status,
    role: row.role,
    level: row.level,
    interviewerMode: row.interviewerMode,
    trainingMode: row.trainingMode,
    questionSourceMode: row.questionSourceMode,
    answeredQuestions: Math.min(row.answeredQuestions, row.questionCount),
    totalQuestions: row.questionCount,
    createdAt: row.createdAt.toISOString(),
    report: row.report
      ? {
          id: row.report.id,
          status: row.report.status,
          overallScore: row.report.overallScore,
          topFixes: row.report.recommendations?.topFixes ?? [],
        }
      : null,
  };
}

function latestTopFixes(rows: DashboardSessionRecord[]): string[] {
  const fixes: string[] = [];
  for (const row of rows) {
    for (const fix of row.report?.recommendations?.topFixes ?? []) {
      if (!fixes.includes(fix)) fixes.push(fix);
      if (fixes.length >= 3) return fixes;
    }
  }
  return fixes;
}

function titleByStatus(status: DashboardSessionRecord['status']): string {
  return status === 'done' ? 'Завершённое интервью' : 'Интервью';
}

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
    title: 'HR-экран',
    subtitle: 'Мотивация, ожидания и базовый скрининг перед этапом с руководителем.',
    sourceType: 'profession',
    focus: 'hr_screening',
    level: 'middle',
    interviewerMode: 'soft',
  },
  {
    id: 'professional',
    title: 'Проф. вопросы',
    subtitle: 'Хард-скиллы и практические задачи по вашей роли.',
    sourceType: 'profession',
    focus: 'professional',
    level: 'middle',
    interviewerMode: 'neutral',
  },
  {
    id: 'behavioral',
    title: 'Кейсы STAR',
    subtitle: 'Кейсы из опыта по структуре STAR: ситуация, задача, действие, результат.',
    sourceType: 'profession',
    focus: 'behavioral',
    level: 'middle',
    interviewerMode: 'neutral',
  },
  {
    id: 'salary-negotiation',
    title: 'Оффер и зарплата',
    subtitle: 'Обсуждение оффера, аргументация цифры и работа с возражениями.',
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
    const sessions = await this.deps.repository.listOwnerSessions(owner, {
      limit: 20,
    });
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
        freeSessionsUsed: items.length,
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

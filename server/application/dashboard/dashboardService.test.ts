import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboardService';

describe('DashboardService', () => {
  it('returns the user role and question scenario for history labels', async () => {
    const repository = {
      listOwnerSessions: vi.fn().mockResolvedValue([
        {
          id: 'session-interviewer',
          status: 'running',
          vacancyTitle: 'Frontend-разработчик',
          companyName: null,
          role: 'Frontend-разработчик',
          level: 'middle',
          interviewerMode: 'neutral',
          trainingMode: 'interviewer',
          questionSourceMode: 'free',
          questionCount: 1,
          answeredQuestions: 1,
          createdAt: new Date('2026-07-14T10:00:00.000Z'),
          report: null,
        },
      ]),
      countOwnerFreeSessionsUsed: vi.fn().mockResolvedValue(0),
    };
    const service = new DashboardService({ repository: repository as never });

    await expect(
      service.listHistory({ anonymousSessionId: 'anon', userId: 'user' })
    ).resolves.toMatchObject({
      items: [
        {
          trainingMode: 'interviewer',
          questionSourceMode: 'free',
        },
      ],
    });
  });

  it('shows a retained completed free interview after the account was recreated', async () => {
    const repository = {
      listOwnerSessions: vi.fn().mockResolvedValue([]),
      countOwnerFreeSessionsUsed: vi.fn().mockResolvedValue(1),
    };
    const service = new DashboardService({ repository: repository as never });

    await expect(
      service.getSummary({
        anonymousSessionId: 'anon_recreated',
        userId: 'user_recreated',
      })
    ).resolves.toMatchObject({
      totals: {
        sessions: 0,
        completed: 0,
        freeSessionsUsed: 1,
        freeSessionsLimit: 1,
      },
    });

    expect(repository.countOwnerFreeSessionsUsed).toHaveBeenCalledWith({
      anonymousSessionId: 'anon_recreated',
      userId: 'user_recreated',
    });
  });
});

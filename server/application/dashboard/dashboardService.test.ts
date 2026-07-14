import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboardService';

describe('DashboardService', () => {
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

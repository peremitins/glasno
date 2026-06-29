import { DashboardService } from './dashboardService';
import { DrizzleDashboardRepository } from '@/server/infrastructure/dashboard/drizzleDashboardRepository';

export function createDashboardService(): DashboardService {
  return new DashboardService({
    repository: new DrizzleDashboardRepository(),
  });
}


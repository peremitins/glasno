import { DashboardSummaryResponseDto } from '@/shared/dto';
import { createDashboardService } from '@/server/application/dashboard/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const service = createDashboardService();
  const summary = await service.getSummary({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
  });

  return DashboardSummaryResponseDto.parse(summary);
});


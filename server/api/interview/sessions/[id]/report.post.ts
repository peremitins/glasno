import { InterviewReportResponseDto } from '@/shared/dto';
import { enqueueOrRunReport } from '@/server/application/reports/reportQueue';
import { createReportService } from '@/server/application/reports/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw apiError('E_VALIDATION', 'Не указан id интервью');
  }

  const service = createReportService(event);
  const config = useRuntimeConfig(event);
  const report = await enqueueOrRunReport({
    service,
    redisUrl: config.redisUrl as string,
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    sessionId: id,
  });

  return InterviewReportResponseDto.parse({ report });
});

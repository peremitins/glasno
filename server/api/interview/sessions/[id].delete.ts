import { DeleteInterviewSessionResponseDto } from '@/shared/dto';
import { createInterviewService } from '@/server/application/interview/serviceFactory';
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

  const service = createInterviewService(event);
  const result = await service.deleteSession({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    sessionId: id,
  });

  return DeleteInterviewSessionResponseDto.parse(result);
});

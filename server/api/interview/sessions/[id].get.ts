import { InterviewStateResponseDto } from '@/shared/dto';
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
  const state = await service.getState({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    sessionId: id,
  });

  return InterviewStateResponseDto.parse(state);
});

import { DeleteQuestionPreferenceResponseDto } from '@/shared/dto';
import { createQuestionPreferenceService } from '@/server/application/questionPreferences/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  const id = getRouterParam(event, 'id');
  if (!session || !id) throw apiError('E_AUTH', 'Сессия не инициализирована');
  const response = await createQuestionPreferenceService(event).delete({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    id,
  });
  return DeleteQuestionPreferenceResponseDto.parse(response);
});

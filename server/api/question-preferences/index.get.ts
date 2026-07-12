import {
  QuestionPreferenceListQueryDto,
  QuestionPreferenceListResponseDto,
} from '@/shared/dto';
import { createQuestionPreferenceService } from '@/server/application/questionPreferences/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { queryDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) throw apiError('E_AUTH', 'Сессия не инициализирована');
  const filters = queryDto(event, QuestionPreferenceListQueryDto);
  const response = await createQuestionPreferenceService(event).list({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    filters,
  });
  return QuestionPreferenceListResponseDto.parse(response);
});

import {
  QuestionPreferenceDto,
  UpdateQuestionPreferenceRequestDto,
} from '@/shared/dto';
import { createQuestionPreferenceService } from '@/server/application/questionPreferences/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  const id = getRouterParam(event, 'id');
  if (!session || !id) throw apiError('E_AUTH', 'Сессия не инициализирована');
  const input = await readDto(event, UpdateQuestionPreferenceRequestDto);
  const response = await createQuestionPreferenceService(event).update({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    id,
    input,
  });
  return QuestionPreferenceDto.parse(response);
});

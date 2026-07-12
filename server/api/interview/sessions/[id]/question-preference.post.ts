import {
  QuestionPreferenceDto,
  SetTurnQuestionPreferenceRequestDto,
} from '@/shared/dto';
import { createQuestionPreferenceService } from '@/server/application/questionPreferences/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  const sessionId = getRouterParam(event, 'id');
  if (!session || !sessionId) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }
  const input = await readDto(event, SetTurnQuestionPreferenceRequestDto);
  const result = await createQuestionPreferenceService(event).setForTurn({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    sessionId,
    input,
  });
  return QuestionPreferenceDto.parse(result);
});

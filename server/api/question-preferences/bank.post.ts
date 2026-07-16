import {
  QuestionPreferenceDto,
  SetBankQuestionPreferenceRequestDto,
} from '@/shared/dto';
import { createQuestionPreferenceService } from '@/server/application/questionPreferences/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) throw apiError('E_AUTH', 'Сессия не инициализирована');
  const input = await readDto(event, SetBankQuestionPreferenceRequestDto);
  const result = await createQuestionPreferenceService(event).setForBankQuestion({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    input,
  });
  return QuestionPreferenceDto.parse(result);
});

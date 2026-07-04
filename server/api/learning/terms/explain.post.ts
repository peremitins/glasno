import {
  ExplainLearningTermRequestDto,
  ExplainLearningTermResponseDto,
} from '@/shared/dto';
import { createLearningTermsService } from '@/server/application/learningTerms/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const input = await readDto(event, ExplainLearningTermRequestDto);
  const service = createLearningTermsService(event);
  const response = await service.explainTerm({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    input,
  });

  return ExplainLearningTermResponseDto.parse(response);
});

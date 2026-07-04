import {
  ExtractLearningTermsRequestDto,
  ExtractLearningTermsResponseDto,
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

  const input = await readDto(event, ExtractLearningTermsRequestDto);
  const service = createLearningTermsService(event);
  const response = await service.extractTerms({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    input,
  });

  return ExtractLearningTermsResponseDto.parse(response);
});

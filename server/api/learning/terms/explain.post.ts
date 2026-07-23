import {
  ExplainLearningTermRequestDto,
  ExplainLearningTermResponseDto,
} from '@/shared/dto';
import { createLearningTermsService } from '@/server/application/learningTerms/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';
import { requireAuthenticatedSession } from '@/server/utils/session';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = requireAuthenticatedSession(event);

  const input = await readDto(event, ExplainLearningTermRequestDto);
  const service = createLearningTermsService(event);
  const response = await service.explainTerm({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    input,
  });

  return ExplainLearningTermResponseDto.parse(response);
});

import {
  AnswerInterviewTurnRequestDto,
  InterviewStateResponseDto,
} from '@/shared/dto';
import { createInterviewService } from '@/server/application/interview/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { requireAuthenticatedSession } from '@/server/utils/session';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = requireAuthenticatedSession(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw apiError('E_VALIDATION', 'Не указан id интервью');
  }

  const input = await readDto(event, AnswerInterviewTurnRequestDto);
  const service = createInterviewService(event);
  const state = await service.answerTurn({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    sessionId: id,
    input,
  });

  return InterviewStateResponseDto.parse(state);
});

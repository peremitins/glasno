import {
  InterviewStateResponseDto,
  NextInterviewQuestionRequestDto,
} from '@/shared/dto';
import { createInterviewService } from '@/server/application/interview/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { requireAuthenticatedSession } from '@/server/utils/session';
import { readDto } from '@/server/utils/validate';

// Явно завершает интервью, сохраняя текущий диалог перед формированием отчёта.
export default defineApiHandler(async (event) => {
  const session = requireAuthenticatedSession(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw apiError('E_VALIDATION', 'Не указан id интервью');
  }

  const input = await readDto(event, NextInterviewQuestionRequestDto);
  const service = createInterviewService(event);
  const state = await service.finishInterview({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    sessionId: id,
    input,
  });

  return InterviewStateResponseDto.parse(state);
});

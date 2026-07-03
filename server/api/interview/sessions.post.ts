import {
  CreateInterviewSessionRequestDto,
  InterviewStateResponseDto,
} from '@/shared/dto';
import { BillingAccessService } from '@/server/application/billing/accessService';
import { DrizzleBillingRepository } from '@/server/infrastructure/billing/drizzleBillingRepository';
import { createInterviewService } from '@/server/application/interview/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const input = await readDto(event, CreateInterviewSessionRequestDto);
  await new BillingAccessService({
    repository: new DrizzleBillingRepository(),
  }).assertCanCreateInterview(
    {
      anonymousSessionId: session.id,
      userId: session.userId ?? null,
      role: session.role ?? null,
    },
    // Free — только быстрый формат; стандарт/глубокий — по тарифу (ТЗ §11).
    { sessionGoal: input.sessionGoal }
  );

  const service = createInterviewService(event);
  const state = await service.createSession({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    input,
  });

  return InterviewStateResponseDto.parse(state);
});

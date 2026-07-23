import {
  CreateInterviewSessionRequestDto,
  InterviewStateResponseDto,
} from '@/shared/dto';
import { BillingAccessService } from '@/server/application/billing/accessService';
import { checkTrialAbuse } from '@/server/application/billing/trialAbuseMonitor';
import { DrizzleBillingRepository } from '@/server/infrastructure/billing/drizzleBillingRepository';
import { createInterviewService } from '@/server/application/interview/serviceFactory';
import { createTelegramAlertsService } from '@/server/application/telegram/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';
import { logger } from '@/server/utils/logger';
import {
  hashRequestIp,
  requireAuthenticatedSession,
} from '@/server/utils/session';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = requireAuthenticatedSession(event);

  const input = await readDto(event, CreateInterviewSessionRequestDto);
  const billingStatus = await new BillingAccessService({
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

  const isTrialSession =
    !billingStatus.unlimited && !billingStatus.hasActivePaidAccess;
  const creatorIpHash = hashRequestIp(event);

  const service = createInterviewService(event);
  const state = await service.createSession({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    input,
    // Бюджет активного времени действует только на бесплатное интервью.
    isTrialSession,
    creatorIpHash,
  });

  // Наблюдение, а не блокировка: за одним IP могут стоять тысячи абонентов
  // мобильной сети, поэтому мы только сообщаем о всплеске. Ошибка проверки
  // не должна помешать пользователю начать интервью.
  if (isTrialSession && creatorIpHash) {
    const alerts = createTelegramAlertsService(event);
    void checkTrialAbuse(
      {
        countTrialSessionsByIpHashSince: (ipHash, since) =>
          new DrizzleBillingRepository().countTrialSessionsByIpHashSince(
            ipHash,
            since
          ),
        notifyTrialAbuseSuspected: (params) =>
          alerts.notifyTrialAbuseSuspected(params),
      },
      creatorIpHash
    ).catch((err) => {
      logger.error({ err }, '[trial] abuse monitor failed');
    });
  }

  return InterviewStateResponseDto.parse(state);
});

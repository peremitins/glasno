import { $fetch } from 'ofetch';
import {
  RealtimeSessionRequestDto,
  RealtimeSessionResponseDto,
} from '@/shared/dto';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import {
  buildRealtimeSessionPayload,
  resolveRealtimeConfig,
} from '@/server/application/realtime/realtimeConfig';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { createInterviewService } from '@/server/application/interview/serviceFactory';
import {
  endRealtimeVoiceSession,
  startRealtimeVoiceSession,
} from '@/server/application/realtime/realtimeVoiceSessionService';
import {
  getInterviewerGender,
  resolveRealtimeVoiceForFace,
} from '@/shared/interviewerVoice';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  'https://api.openai.com/v1/realtime/client_secrets';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const runtimeConfig = useRuntimeConfig(event);
  const { apiKey } = resolveOpenAiConfig(runtimeConfig);
  if (!apiKey) {
    throw apiError('E_UPSTREAM', 'NUXT_OPENAI_API_KEY не задан');
  }

  const input = await readDto(event, RealtimeSessionRequestDto);
  const interviewService = createInterviewService(event);
  const state = await interviewService.getState({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    sessionId: input.sessionId,
  });
  const currentTurn = state.currentTurn;
  if (!currentTurn) {
    throw apiError('E_CONFLICT', 'Нет активного вопроса для голосового режима');
  }

  const realtimeConfig = {
    ...resolveRealtimeConfig(runtimeConfig),
    voice: resolveRealtimeVoiceForFace(state.session.interviewerFaceId),
  };
  const billingStatus = await createBillingService(event).getStatus({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    role: session.role ?? null,
  });
  const realtimeSession = await startRealtimeVoiceSession({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    interviewSessionId: state.session.id,
    model: realtimeConfig.model,
    maxDurationSeconds: state.session.realtimeLimits.hardLimitMinutes * 60,
    remainingSeconds: billingStatus.realtimeVoice.remainingMinutes * 60,
  });
  const payload = buildRealtimeSessionPayload(
    {
      sessionId: state.session.id,
      role: state.session.role,
      level: state.session.level,
      interviewerMode: state.session.interviewerMode,
      interviewerGender: getInterviewerGender(state.session.interviewerFaceId),
      vacancyTitle: state.session.vacancyTitle,
      companyName: state.session.companyName,
      currentQuestion: currentTurn.question,
    },
    realtimeConfig
  );

  try {
    const response: any = await $fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
      method: 'POST',
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    const clientSecret = String(
      response?.client_secret?.value || response?.value || ''
    );
    if (!clientSecret) {
      throw new Error('OpenAI response does not include client_secret.value');
    }

    return RealtimeSessionResponseDto.parse({
      realtimeSessionId: realtimeSession.id,
      clientSecret,
      expiresAt:
        typeof response?.client_secret?.expires_at === 'number'
          ? response.client_secret.expires_at
          : typeof response?.expires_at === 'number'
            ? response.expires_at
          : null,
      model: realtimeConfig.model,
      voice: realtimeConfig.voice,
      maxDurationSeconds: realtimeSession.maxDurationSeconds,
      idleTimeoutSeconds: realtimeSession.idleTimeoutSeconds,
      remainingSeconds: realtimeSession.remainingSeconds,
      realtimeLimits: state.session.realtimeLimits,
    });
  } catch (error: any) {
    await endRealtimeVoiceSession({
      realtimeSessionId: realtimeSession.id,
      anonymousSessionId: session.id,
      userId: session.userId ?? null,
      reason: 'provider_error',
    });
    throw apiError('E_UPSTREAM', 'OpenAI Realtime session не создана', {
      cause: error?.data?.error?.message || error?.message || String(error),
    });
  }
});

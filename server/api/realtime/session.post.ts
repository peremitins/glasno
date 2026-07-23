import { $fetch } from 'ofetch';
import {
  RealtimeSessionRequestDto,
  RealtimeSessionResponseDto,
} from '@/shared/dto';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import {
  buildRealtimeContextFromState,
  buildRealtimeInstructions,
  buildRealtimeSessionPayload,
  resolveRealtimeConfig,
} from '@/server/application/realtime/realtimeConfig';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { createInterviewService } from '@/server/application/interview/serviceFactory';
import {
  endRealtimeVoiceSession,
  startRealtimeVoiceSession,
} from '@/server/application/realtime/realtimeVoiceSessionService';
import { resolveRealtimeVoiceForFace } from '@/shared/interviewerVoice';
import { apiError } from '@/server/utils/errors';
import { assertDirectOpenAiAccessAllowed } from '@/server/infrastructure/llm/openaiResponsesClient';
import { defineApiHandler } from '@/server/utils/handler';
import { requireAuthenticatedSession } from '@/server/utils/session';
import { readDto } from '@/server/utils/validate';

// WebSocket-фоллбэк (Firefox) получает ephemeral-ключ напрямую от OpenAI:
// AI-relay пока не проксирует /v1/realtime/client_secrets и WebSocket (см.
// .docs/DEPLOY.md, «Риски / что проверить после первого деплоя»). WebRTC
// (основной транспорт) секрет не запрашивает — SDP обменивается через
// /api/realtime/session/sdp, который уже ходит в OpenAI через relay.
const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  'https://api.openai.com/v1/realtime/client_secrets';

export default defineApiHandler(async (event) => {
  const session = requireAuthenticatedSession(event);

  const input = await readDto(event, RealtimeSessionRequestDto);
  const runtimeConfig = useRuntimeConfig(event);
  const { apiKey } = resolveOpenAiConfig(runtimeConfig);
  if (input.transport === 'websocket' && !apiKey) {
    throw apiError('E_UPSTREAM', 'Провайдер голосового режима не настроен');
  }

  const interviewService = createInterviewService(event);
  const state = await interviewService.getState({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    sessionId: input.sessionId,
  });
  if (!state.currentTurn) {
    throw apiError(
      'E_CONFLICT',
      'Нет активного вопроса для голосового режима'
    );
  }

  const realtimeConfig = {
    ...resolveRealtimeConfig(runtimeConfig),
    voice: resolveRealtimeVoiceForFace(state.session.interviewerFaceId),
  };
  // Резюме и описание вакансии не входят в DTO состояния — забираем отдельно,
  // иначе AI-кандидат не знает биографии, по которой должен играть.
  const background = await interviewService.getSessionBackground({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    sessionId: input.sessionId,
  });
  const realtimeContext = buildRealtimeContextFromState(state, background);
  const instructions = buildRealtimeInstructions(realtimeContext);
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
    unlimited: billingStatus.unlimited,
  });

  const baseResponse = {
    realtimeSessionId: realtimeSession.id,
    model: realtimeConfig.model,
    voice: realtimeConfig.voice,
    instructions,
    maxDurationSeconds: realtimeSession.maxDurationSeconds,
    idleTimeoutSeconds: realtimeSession.idleTimeoutSeconds,
    remainingSeconds: realtimeSession.remainingSeconds,
    realtimeLimits: state.session.realtimeLimits,
  };

  if (input.transport !== 'websocket') {
    return RealtimeSessionResponseDto.parse({
      ...baseResponse,
      clientSecret: null,
      expiresAt: null,
    });
  }

  // Relay пока не выдаёт ephemeral secrets; на проде не обходим его напрямую.
  assertDirectOpenAiAccessAllowed();

  const payload = buildRealtimeSessionPayload(
    realtimeContext,
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
      throw new Error('Провайдер не вернул ключ голосовой сессии');
    }

    return RealtimeSessionResponseDto.parse({
      ...baseResponse,
      clientSecret,
      expiresAt:
        typeof response?.client_secret?.expires_at === 'number'
          ? response.client_secret.expires_at
          : typeof response?.expires_at === 'number'
            ? response.expires_at
            : null,
    });
  } catch (error: any) {
    await endRealtimeVoiceSession({
      realtimeSessionId: realtimeSession.id,
      anonymousSessionId: session.id,
      userId: session.userId ?? null,
      reason: 'provider_error',
    });
    throw apiError('E_UPSTREAM', 'Не удалось запустить голосовой режим', {
      cause: error?.data?.error?.message || error?.message || String(error),
    });
  }
});

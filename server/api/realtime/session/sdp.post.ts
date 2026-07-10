import {
  RealtimeSessionSdpRequestDto,
  RealtimeSessionSdpResponseDto,
} from '@/shared/dto';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import {
  buildRealtimeContextFromState,
  buildRealtimeSessionPayload,
  resolveRealtimeConfig,
} from '@/server/application/realtime/realtimeConfig';
import { createInterviewService } from '@/server/application/interview/serviceFactory';
import { endRealtimeVoiceSession } from '@/server/application/realtime/realtimeVoiceSessionService';
import { sendOpenAiRealtimeCallRequest } from '@/server/infrastructure/llm/openaiResponsesClient';
import { resolveRealtimeVoiceForFace } from '@/shared/interviewerVoice';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

// WebRTC-транспорт realtime-voice: SDP-обмен идёт не напрямую в OpenAI (это
// упиралось в гео-блок из РФ), а через AI-relay — тем же путём, что и
// /v1/responses. Session-конфиг (инструкции, голос, модель) восстанавливаем
// из interview state сами, а не берём от клиента, — чтобы нельзя было
// подменить модель/инструкции в обход серверной валидации.
export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const input = await readDto(event, RealtimeSessionSdpRequestDto);
  const runtimeConfig = useRuntimeConfig(event);
  const { apiKey } = resolveOpenAiConfig(runtimeConfig);

  const interviewService = createInterviewService(event);
  const state = await interviewService.getState({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    sessionId: input.sessionId,
  });

  const realtimeConfig = {
    ...resolveRealtimeConfig(runtimeConfig),
    voice: resolveRealtimeVoiceForFace(state.session.interviewerFaceId),
  };
  const payload = buildRealtimeSessionPayload(
    buildRealtimeContextFromState(state),
    realtimeConfig
  );

  try {
    const answerSdp = await sendOpenAiRealtimeCallRequest({
      sdp: input.sdp,
      session: payload.session,
      apiKey,
      timeoutMs: 30_000,
    });

    return RealtimeSessionSdpResponseDto.parse({ sdp: answerSdp });
  } catch (error) {
    await endRealtimeVoiceSession({
      realtimeSessionId: input.realtimeSessionId,
      anonymousSessionId: session.id,
      userId: session.userId ?? null,
      reason: 'provider_error',
    });
    throw error;
  }
});

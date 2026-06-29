import {
  RealtimeSessionEndRequestDto,
  RealtimeSessionLifecycleResponseDto,
} from '@/shared/dto';
import { endRealtimeVoiceSession } from '@/server/application/realtime/realtimeVoiceSessionService';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const input = await readDto(event, RealtimeSessionEndRequestDto);
  await endRealtimeVoiceSession({
    realtimeSessionId: input.realtimeSessionId,
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    reason: input.reason,
  });

  return RealtimeSessionLifecycleResponseDto.parse({ ok: true });
});

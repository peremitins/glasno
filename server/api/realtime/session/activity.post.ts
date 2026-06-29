import {
  RealtimeSessionActivityRequestDto,
  RealtimeSessionLifecycleResponseDto,
} from '@/shared/dto';
import { touchRealtimeVoiceSession } from '@/server/application/realtime/realtimeVoiceSessionService';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const input = await readDto(event, RealtimeSessionActivityRequestDto);
  await touchRealtimeVoiceSession({
    realtimeSessionId: input.realtimeSessionId,
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
  });

  return RealtimeSessionLifecycleResponseDto.parse({ ok: true });
});

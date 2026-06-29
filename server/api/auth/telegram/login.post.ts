import { AuthLoginResponseDto, TelegramLoginRequestDto } from '@/shared/dto';
import { pickLoginResponse } from '@/server/application/auth/authService';
import { setAuthCookies } from '@/server/application/auth/httpCookies';
import { createAuthService } from '@/server/application/auth/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const payload = await readDto(event, TelegramLoginRequestDto);
  const result = await createAuthService(event).verifyTelegramLogin({
    payload,
    anonymousSessionId: session.id,
  });

  setAuthCookies(event, result);
  return AuthLoginResponseDto.parse(pickLoginResponse(result));
});

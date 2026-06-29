import { AuthLoginResponseDto, MagicLoginConsumeQueryDto } from '@/shared/dto';
import { pickLoginResponse } from '@/server/application/auth/authService';
import { setAuthCookies } from '@/server/application/auth/httpCookies';
import { createAuthService } from '@/server/application/auth/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { queryDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const query = queryDto(event, MagicLoginConsumeQueryDto);
  const result = await createAuthService(event).consumeMagicLogin({
    token: query.token,
    anonymousSessionId: session.id,
  });

  setAuthCookies(event, result);
  return AuthLoginResponseDto.parse(pickLoginResponse(result));
});

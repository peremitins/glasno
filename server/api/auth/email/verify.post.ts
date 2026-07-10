import { AuthLoginResponseDto, EmailLoginVerifyRequestDto } from '@/shared/dto';
import {
  pickLoginResponse,
} from '@/server/application/auth/authService';
import { setAuthCookies } from '@/server/application/auth/httpCookies';
import { createAuthService } from '@/server/application/auth/serviceFactory';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const input = await readDto(event, EmailLoginVerifyRequestDto);
  const result = await createAuthService(event).verifyEmailLogin({
    ...input,
    anonymousSessionId: session.id,
  });

  setAuthCookies(event, result);
  if (result.user.email) {
    try {
      await createBillingService(event).claimGiftsForUser({
        userId: result.user.id,
        email: result.user.email,
      });
    } catch (err) {
      // Вход уже подтверждён и не должен ломаться из-за временной ошибки
      // активации. AccessService повторит claim при первом платном действии.
      console.error('[billing] gift claim after email login failed', err);
    }
  }
  return AuthLoginResponseDto.parse(pickLoginResponse(result));
});

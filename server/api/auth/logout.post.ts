import { LogoutResponseDto } from '@/shared/dto';
import { clearAuthCookies } from '@/server/application/auth/httpCookies';
import { createAuthRepository } from '@/server/application/auth/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  if (event.context.auth) {
    await createAuthRepository().revokeAuthSession(event.context.auth.session.id);
  }

  clearAuthCookies(event);
  return LogoutResponseDto.parse({ ok: true });
});

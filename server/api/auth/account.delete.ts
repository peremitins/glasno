import { DeleteAccountResponseDto } from '@/shared/dto';
import { clearAuthCookies } from '@/server/application/auth/httpCookies';
import { createAuthService } from '@/server/application/auth/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const auth = event.context.auth;
  if (!auth) {
    throw apiError('E_AUTH', 'Для удаления аккаунта нужно войти');
  }

  const result = await createAuthService(event).deleteAccount(auth.user.id);
  clearAuthCookies(event);
  return DeleteAccountResponseDto.parse(result);
});

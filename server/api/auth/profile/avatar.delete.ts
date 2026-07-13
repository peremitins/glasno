import { AuthProfileResponseDto } from '@/shared/dto';
import { createAuthService } from '@/server/application/auth/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const auth = event.context.auth;
  if (!auth) {
    throw apiError('E_AUTH', 'Для удаления аватара нужно войти');
  }

  const user = await createAuthService(event).deleteAvatar(auth.user.id);
  return AuthProfileResponseDto.parse({ user });
});

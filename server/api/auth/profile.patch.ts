import {
  AuthProfileResponseDto,
  UpdateProfileRequestDto,
} from '@/shared/dto';
import { createAuthService } from '@/server/application/auth/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const auth = event.context.auth;
  if (!auth) {
    throw apiError('E_AUTH', 'Для изменения профиля нужно войти');
  }

  const input = await readDto(event, UpdateProfileRequestDto);
  const user = await createAuthService(event).updateProfile(
    auth.user.id,
    input.displayName
  );
  return AuthProfileResponseDto.parse({ user });
});

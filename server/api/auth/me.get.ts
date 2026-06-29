import { AuthMeResponseDto } from '@/shared/dto';
import { toAuthUserDto } from '@/server/application/auth/authService';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler((event) => {
  const auth = event.context.auth;
  return AuthMeResponseDto.parse({
    isAuthenticated: Boolean(auth),
    user: auth ? toAuthUserDto(auth.user) : null,
  });
});

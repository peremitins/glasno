import { AuthProfileResponseDto } from '@/shared/dto';
import { createAuthService } from '@/server/application/auth/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readAvatarMultipartFile } from './avatarUpload';

export default defineApiHandler(async (event) => {
  const auth = event.context.auth;
  if (!auth) {
    throw apiError('E_AUTH', 'Для загрузки аватара нужно войти');
  }

  const file = await readAvatarMultipartFile(event);

  const user = await createAuthService(event).uploadAvatar(auth.user.id, {
    data: Buffer.from(file.data),
    mimeType: file.type ?? null,
  });
  return AuthProfileResponseDto.parse({ user });
});

import { createAuthService } from '@/server/application/auth/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const auth = event.context.auth;
  if (!auth) {
    throw apiError('E_AUTH', 'Для просмотра аватара нужно войти');
  }

  const query = getQuery(event);
  const avatarVersion = typeof query.v === 'string' ? query.v : null;
  const avatar = await createAuthService(event).getAvatar(
    auth.user.id,
    avatarVersion
  );
  setResponseHeader(event, 'Content-Type', 'image/webp');
  setResponseHeader(event, 'Content-Length', avatar.length);
  setResponseHeader(event, 'Cache-Control', 'private, max-age=31536000, immutable');
  setResponseHeader(event, 'Vary', 'Cookie');
  return avatar;
});

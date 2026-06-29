import { SessionResponseDto } from '@/shared/dto';
import { toAuthUserDto } from '@/server/application/auth/authService';
import { defineApiHandler } from '@/server/utils/handler';
import { apiError } from '@/server/utils/errors';

// Возвращает текущую (анонимную) сессию. Демонстрирует каркас Фазы 1:
// единый формат ответа/ошибок + сессия из middleware.
export default defineApiHandler((event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  return SessionResponseDto.parse({
    id: session.id,
    isAnonymous: session.isAnonymous,
    user: event.context.auth ? toAuthUserDto(event.context.auth.user) : null,
  });
});

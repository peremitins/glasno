import {
  SupportMessageRequestDto,
  SupportMessageResponseDto,
} from '@/shared/dto';
import { sendSupportEmail } from '@/server/application/support/supportEmailSender';
import { isSmtpConfigured } from '@/server/infrastructure/email/smtpEmailSender';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

const MAX_MESSAGES_PER_WINDOW = 5;
const WINDOW_MS = 60 * 60 * 1000;

const sentTimestampsByUser = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (sentTimestampsByUser.get(userId) ?? []).filter(
    (ts) => now - ts < WINDOW_MS
  );
  if (recent.length >= MAX_MESSAGES_PER_WINDOW) {
    sentTimestampsByUser.set(userId, recent);
    return true;
  }
  recent.push(now);
  sentTimestampsByUser.set(userId, recent);
  return false;
}

export default defineApiHandler(async (event) => {
  const auth = event.context.auth;
  if (!auth) {
    throw apiError('E_AUTH', 'Чтобы написать в поддержку, нужно войти');
  }

  const input = await readDto(event, SupportMessageRequestDto);

  if (isRateLimited(auth.user.id)) {
    throw apiError(
      'E_RATE',
      'Слишком много обращений подряд. Попробуйте позже'
    );
  }

  if (!isSmtpConfigured()) {
    throw apiError('E_UPSTREAM', 'Отправка сообщений временно недоступна');
  }

  const sent = await sendSupportEmail({
    user: {
      id: auth.user.id,
      email: auth.user.email,
      displayName: auth.user.displayName,
      telegramUsername: auth.user.telegramUsername,
    },
    subject: input.subject,
    message: input.message,
  });
  if (!sent) {
    throw apiError('E_UPSTREAM', 'Не удалось отправить сообщение. Попробуйте позже');
  }

  return SupportMessageResponseDto.parse({ ok: true });
});

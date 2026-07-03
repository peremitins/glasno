import { BillingWebhookResponseDto } from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import {
  isTrustedYooKassaIp,
  parseTrustedCidrsEnv,
  YOOKASSA_DEFAULT_TRUSTED_CIDRS,
} from '@/server/application/billing/yookassaWebhookIps';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  // Вебхук — публичный endpoint. Настоящая защита — обратный запрос статуса
  // платежа в YooKassa API (billingService): подделать платёж нельзя
  // независимо от IP. IP-проверка — второй эшелон (анти-спам), и по
  // умолчанию работает в режиме «предупреждать, но не блокировать»:
  // за прокси/CDN с кривым x-forwarded-for жёсткий фильтр молча отбрасывал
  // бы НАСТОЯЩИЕ вебхуки. Включить блокировку после проверки инфраструктуры:
  // NUXT_YOOKASSA_WEBHOOK_ENFORCE_IP=true.
  const cidrs =
    parseTrustedCidrsEnv(process.env.NUXT_YOOKASSA_TRUSTED_IPS) ??
    YOOKASSA_DEFAULT_TRUSTED_CIDRS;
  const ip = getRequestIP(event, { xForwardedFor: true });
  if (!isTrustedYooKassaIp(ip, cidrs)) {
    console.warn('[billing] yookassa webhook: untrusted source ip', { ip });
    if (process.env.NUXT_YOOKASSA_WEBHOOK_ENFORCE_IP === 'true') {
      throw apiError('E_FORBIDDEN', 'Недоверенный источник уведомления');
    }
  }

  const payload = await readBody(event);
  const service = createBillingService(event);
  await service.handleYooKassaWebhook(payload);
  return BillingWebhookResponseDto.parse({ ok: true });
});

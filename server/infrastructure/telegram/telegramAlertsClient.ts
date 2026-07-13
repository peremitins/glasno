import { $fetch } from 'ofetch';
import type { TelegramAlertsPort } from '@/server/interface/telegramAlerts';
import { logger } from '@/server/utils/logger';

export interface TelegramAlertsClientConfig {
  botToken: string;
  chatId: string;
  // Прямой api.telegram.org может быть заблокирован с прод-сервера (РФ);
  // тогда сюда передаётся проксирующий хост (например, Cloudflare Worker,
  // пробрасывающий запросы 1-в-1 к Telegram Bot API).
  apiHost?: string;
}

export class TelegramAlertsClient implements TelegramAlertsPort {
  constructor(private readonly config: TelegramAlertsClientConfig) {}

  async send(text: string): Promise<void> {
    const { botToken, chatId, apiHost } = this.config;
    if (!botToken || !chatId) return;

    try {
      // Без parse_mode: текст алертов содержит непроверенные email/имена
      // пользователей, а Markdown-парсинг Telegram падает на несбалансированных
      // спецсимволах (например, "_" в email) и всё сообщение не доставляется.
      await $fetch(`https://${apiHost || 'api.telegram.org'}/bot${botToken}/sendMessage`, {
        method: 'POST',
        body: {
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        },
      });
    } catch (err) {
      logger.error({ err }, '[telegram] alert delivery failed');
    }
  }
}

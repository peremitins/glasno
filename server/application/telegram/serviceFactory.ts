import type { H3Event } from 'h3';
import { TelegramAlertsClient } from '@/server/infrastructure/telegram/telegramAlertsClient';
import { TelegramAlertsService } from './telegramAlertsService';

// Минимально необходимый срез runtime-конфига: фабрику вызывают и хендлеры
// (с event), и код без event (глобальный обработчик ошибок).
interface TelegramAlertsRuntimeConfig {
  telegramAlertsBotToken?: unknown;
  telegramAlertsChatId?: unknown;
}

export function createTelegramAlertsService(event: H3Event): TelegramAlertsService {
  return createTelegramAlertsServiceFromConfig(useRuntimeConfig(event));
}

export function createTelegramAlertsServiceFromConfig(
  config: TelegramAlertsRuntimeConfig
): TelegramAlertsService {
  return new TelegramAlertsService(
    new TelegramAlertsClient({
      botToken: (config.telegramAlertsBotToken as string) || '',
      chatId: (config.telegramAlertsChatId as string) || '',
    })
  );
}

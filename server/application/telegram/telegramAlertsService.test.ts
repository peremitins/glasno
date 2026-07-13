import { describe, expect, it, vi } from 'vitest';
import { TelegramAlertsService } from './telegramAlertsService';
import type { TelegramAlertsPort } from '@/server/interface/telegramAlerts';

function createPort(): TelegramAlertsPort & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

const user = {
  id: 'user-1',
  email: 'ivan@example.com',
  telegramId: null,
  telegramUsername: null,
  displayName: 'Иван',
};

describe('TelegramAlertsService', () => {
  it('notifyUserRegistered отправляет отформатированный текст в порт', async () => {
    const port = createPort();
    const service = new TelegramAlertsService(port);

    await service.notifyUserRegistered(user);

    expect(port.send).toHaveBeenCalledTimes(1);
    expect(port.send.mock.calls[0]?.[0]).toContain('Новый пользователь');
  });

  it('notifyUserDeleted отправляет отформатированный текст в порт', async () => {
    const port = createPort();
    const service = new TelegramAlertsService(port);

    await service.notifyUserDeleted(user);

    expect(port.send.mock.calls[0]?.[0]).toContain('Удаление аккаунта');
  });

  it('notifySubscriptionPurchased отправляет отформатированный текст в порт', async () => {
    const port = createPort();
    const service = new TelegramAlertsService(port);

    await service.notifySubscriptionPurchased({
      user,
      planName: 'Полный доступ · 30 дн.',
      amountRub: 990,
      isRenewal: false,
    });

    expect(port.send.mock.calls[0]?.[0]).toContain('Новая подписка');
  });

  it('notifyVoiceMinutesPurchased отправляет отформатированный текст в порт', async () => {
    const port = createPort();
    const service = new TelegramAlertsService(port);

    await service.notifyVoiceMinutesPurchased({
      user,
      planName: 'Пакет 60 минут',
      minutes: 60,
      amountRub: 490,
    });

    expect(port.send.mock.calls[0]?.[0]).toContain('Докупка минут');
  });

  it('notifyCriticalError отправляет отформатированный текст в порт', async () => {
    const port = createPort();
    const service = new TelegramAlertsService(port);

    await service.notifyCriticalError({
      route: '/api/auth/login',
      requestId: 'req-1',
      message: 'boom',
    });

    expect(port.send.mock.calls[0]?.[0]).toContain('Критическая ошибка');
  });

  it('не бросает исключение, если порт падает', async () => {
    const port: TelegramAlertsPort = { send: vi.fn().mockRejectedValue(new Error('down')) };
    const service = new TelegramAlertsService(port);

    await expect(service.notifyUserRegistered(user)).resolves.toBeUndefined();
  });
});

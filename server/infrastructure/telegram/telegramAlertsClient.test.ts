import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TelegramAlertsClient } from './telegramAlertsClient';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('ofetch', () => ({
  $fetch: fetchMock,
}));

describe('TelegramAlertsClient', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('отправляет POST на Telegram Bot API с текстом сообщения', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    const client = new TelegramAlertsClient({
      botToken: 'bot-token-123',
      chatId: '-100500',
    });

    await client.send('привет');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token-123/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: {
          chat_id: '-100500',
          text: 'привет',
          disable_web_page_preview: true,
        },
      })
    );
  });

  it('не передаёт parse_mode: текст алертов содержит непроверенные email/имена пользователей,\n      а Markdown-парсинг Telegram падает на несбалансированных спецсимволах', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    const client = new TelegramAlertsClient({
      botToken: 'bot-token-123',
      chatId: '-100500',
    });

    await client.send('Имя: Иван_Иванов *звезда*');

    const call = fetchMock.mock.calls[0]?.[1] as { body?: Record<string, unknown> };
    expect(call.body).not.toHaveProperty('parse_mode');
  });

  it('не отправляет запрос, если botToken не задан', async () => {
    const client = new TelegramAlertsClient({ botToken: '', chatId: '-100500' });

    await client.send('привет');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('не отправляет запрос, если chatId не задан', async () => {
    const client = new TelegramAlertsClient({ botToken: 'bot-token-123', chatId: '' });

    await client.send('привет');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('не бросает исключение, если Telegram API отвечает ошибкой', async () => {
    fetchMock.mockRejectedValueOnce(new Error('telegram is down'));
    const client = new TelegramAlertsClient({
      botToken: 'bot-token-123',
      chatId: '-100500',
    });

    await expect(client.send('привет')).resolves.toBeUndefined();
  });
});

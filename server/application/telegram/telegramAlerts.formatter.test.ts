import { describe, expect, it } from 'vitest';
import {
  formatCriticalErrorAlert,
  formatSubscriptionPurchasedAlert,
  formatUserDeletedAlert,
  formatUserRegisteredAlert,
  formatVoiceMinutesPurchasedAlert,
} from './telegramAlerts.formatter';

describe('formatUserRegisteredAlert', () => {
  it('включает заголовок с меткой glasno и все доступные поля личности', () => {
    const text = formatUserRegisteredAlert({
      id: 'user-1',
      email: 'ivan@example.com',
      telegramId: '42',
      telegramUsername: 'ivan_tg',
      displayName: 'Иван',
    });

    expect(text).toContain('[glasno]');
    expect(text).toContain('Новый пользователь');
    expect(text).toContain('Иван');
    expect(text).toContain('ivan@example.com');
    expect(text).toContain('@ivan_tg');
    expect(text).toContain('user-1');
  });

  it('не оставляет пустых строк для отсутствующих полей (например, только email)', () => {
    const text = formatUserRegisteredAlert({
      id: 'user-2',
      email: 'anon@example.com',
      telegramId: null,
      telegramUsername: null,
      displayName: null,
    });

    expect(text).not.toContain('Telegram:');
    expect(text).not.toContain('Имя:');
    expect(text).toContain('anon@example.com');
  });
});

describe('formatUserDeletedAlert', () => {
  it('помечает сообщение как удаление аккаунта', () => {
    const text = formatUserDeletedAlert({
      id: 'user-3',
      email: 'deleted@example.com',
      telegramId: null,
      telegramUsername: null,
      displayName: null,
    });

    expect(text).toContain('[glasno]');
    expect(text).toContain('Удаление аккаунта');
    expect(text).toContain('deleted@example.com');
  });
});

describe('formatSubscriptionPurchasedAlert', () => {
  it('различает новую подписку и автопродление', () => {
    const purchased = formatSubscriptionPurchasedAlert({
      user: { id: 'u1', email: 'a@example.com', telegramId: null, telegramUsername: null, displayName: null },
      planName: 'Полный доступ · 30 дн.',
      amountRub: 990,
      isRenewal: false,
    });
    const renewed = formatSubscriptionPurchasedAlert({
      user: { id: 'u1', email: 'a@example.com', telegramId: null, telegramUsername: null, displayName: null },
      planName: 'Полный доступ · 30 дн.',
      amountRub: 990,
      isRenewal: true,
    });

    expect(purchased).toContain('Новая подписка');
    expect(purchased).not.toContain('Автопродление');
    expect(renewed).toContain('Автопродление');
    expect(purchased).toContain('990');
    expect(purchased).toContain('Полный доступ · 30 дн.');
  });
});

describe('formatVoiceMinutesPurchasedAlert', () => {
  it('указывает пакет минут и сумму', () => {
    const text = formatVoiceMinutesPurchasedAlert({
      user: { id: 'u2', email: 'b@example.com', telegramId: null, telegramUsername: null, displayName: null },
      planName: 'Пакет 60 минут',
      minutes: 60,
      amountRub: 490,
    });

    expect(text).toContain('[glasno]');
    expect(text).toContain('Докупка минут');
    expect(text).toContain('+60 мин');
    expect(text).toContain('490');
  });
});

describe('formatCriticalErrorAlert', () => {
  it('включает route и сообщение об ошибке, requestId — только если задан', () => {
    const withRequestId = formatCriticalErrorAlert({
      route: '/api/billing/webhook/yookassa',
      requestId: 'req-1',
      message: 'Unexpected token',
    });
    const withoutRequestId = formatCriticalErrorAlert({
      route: '/api/auth/login',
      requestId: null,
      message: 'DB timeout',
    });

    expect(withRequestId).toContain('[glasno]');
    expect(withRequestId).toContain('/api/billing/webhook/yookassa');
    expect(withRequestId).toContain('req-1');
    expect(withRequestId).toContain('Unexpected token');
    expect(withoutRequestId).not.toContain('Request-ID');
  });
});

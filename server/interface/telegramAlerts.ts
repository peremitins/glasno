// Порт для служебных Telegram-алертов (регистрации, оплаты, ошибки и т.п.).
// Не путать с telegramBotToken — тем ботом пользователи логинятся в приложение.
export interface TelegramAlertsPort {
  send(text: string): Promise<void>;
}

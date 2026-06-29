import pino from 'pino';

// Единый логгер бэкенда. Уровень — из LOG_LEVEL (по умолчанию info).
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

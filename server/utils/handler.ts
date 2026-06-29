import type { EventHandler, H3Event } from 'h3';
import { ZodError } from 'zod';
import { isApiError, type ApiErrorData } from './errors';
import { logger } from './logger';

// Обёртка над хендлерами: гарантирует единый формат ответа об ошибке
// { error: { code, message, details } } и корректный HTTP-статус.
// Использование:
//   export default defineApiHandler((event) => { ... })
export function defineApiHandler<T>(
  fn: (event: H3Event) => T | Promise<T>
): EventHandler {
  return defineEventHandler(async (event) => {
    try {
      return await fn(event);
    } catch (err) {
      const requestId = event.context.requestId;

      // Наша доменная ошибка
      if (isApiError(err)) {
        setResponseStatus(event, err.statusCode);
        return { error: err.data satisfies ApiErrorData };
      }

      // Ошибка валидации Zod
      if (err instanceof ZodError) {
        setResponseStatus(event, 400);
        return {
          error: {
            code: 'E_VALIDATION',
            message: 'Ошибка валидации данных',
            details: err.issues,
          },
        };
      }

      // Всё остальное — не раскрываем детали наружу, пишем в лог
      logger.error({ err, requestId }, 'Unhandled API error');
      setResponseStatus(event, 500);
      return {
        error: { code: 'E_UNKNOWN', message: 'Внутренняя ошибка сервера' },
      };
    }
  });
}

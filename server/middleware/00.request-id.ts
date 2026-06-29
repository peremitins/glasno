import { randomUUID } from 'node:crypto';

// Присваивает каждому запросу request-id (из заголовка или новый),
// кладёт в контекст и возвращает в ответе — для трассировки логов.
export default defineEventHandler((event) => {
  const incoming = getHeader(event, 'x-request-id');
  const id = incoming || randomUUID();
  event.context.requestId = id;
  setResponseHeader(event, 'x-request-id', id);
});

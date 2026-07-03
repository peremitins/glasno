// Имя CSRF-cookie нужно и серверу (double-submit проверка в middleware),
// и клиенту (чтение токена для заголовка запроса) — поэтому живёт в shared.
export const CSRF_COOKIE_NAME = 'glasno_csrf';

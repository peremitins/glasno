# Фаза 4 — дизайн реализации

## Цель

Добавить полноценный слой авторизации поверх уже работающей анонимной сессии: пользователь может войти по email-коду или Telegram Login Widget, а интервью и отчёты из текущей анонимной cookie закрепляются за аккаунтом.

## Границы фазы

Входит:
- passwordless-вход по email-коду;
- проверка подписи Telegram Login Widget;
- auth-сессия в httpOnly cookie;
- CSRF double submit для state-changing запросов авторизованного пользователя;
- миграция `anonymous_session_id` в `user_id`;
- magic-link consume flow как задел под Telegram-бота;
- `requireRole` helper.

Не входит:
- SMTP/transactional email провайдер;
- UI Telegram Widget с реальным bot username;
- кабинет платежей;
- Telegram-бот и генерация magic-link из бота.

## Архитектура

- `shared/dto/auth.ts` — DTO auth API.
- `server/application/auth/*` — криптография, сервис авторизации, сервис auth-сессий.
- `server/interface/authRepository.ts` — порт хранения пользователей, кодов, сессий и magic-link.
- `server/infrastructure/auth/drizzleAuthRepository.ts` — Drizzle-реализация порта.
- `server/utils/session.ts` — сохраняет anonymous session и умеет читать auth session.
- `server/middleware/30.session.ts` — кладёт в контекст anonymous session и authenticated user.
- `server/middleware/40.csrf.ts` — double-submit защита.
- `server/utils/requireRole.ts` — проверка ролей для будущих admin/internal routes.

## Сессии

Сохраняем две cookie:
- `glasno_sid` — существующая подписанная anonymous cookie, httpOnly, 1 год;
- `glasno_auth` — auth session id + подпись, httpOnly, 30 дней;
- `glasno_csrf` — клиентская CSRF cookie, не httpOnly, 30 дней.

`glasno_sid` не удаляется при логине: она нужна для миграции данных и для безопасного продолжения текущего интервью. После входа новые интервью получают и `anonymous_session_id`, и `user_id`.

## CSRF

Для авторизованных пользователей все unsafe `/api` методы (`POST`, `PUT`, `PATCH`, `DELETE`) требуют:
- cookie `glasno_csrf`;
- заголовок `x-csrf-token`;
- совпадение значения cookie и заголовка;
- совпадение hash токена с записью auth-сессии.

Auth bootstrap endpoints (`/api/auth/email/start`, `/api/auth/email/verify`, `/api/auth/telegram/login`, `/api/auth/magic/consume`) исключены, потому что сессии до них ещё нет.

## Миграция данных

После успешного логина сервис выполняет:

```sql
update interview_sessions
set user_id = :userId
where anonymous_session_id = :anonymousSessionId
  and user_id is null;
```

Доступ к интервью разрешён, если совпадает `anonymous_session_id` или `user_id`. Это сохраняет обратную совместимость фаз 2-3 и позволяет открыть историю после входа с другого запроса той же auth-сессии.

## Magic-link

Фаза 4 добавляет безопасное потребление одноразового токена:
- токен хранится только как hash;
- есть срок жизни;
- после consume токен помечается использованным;
- логин создаёт обычную auth-сессию и мигрирует anonymous данные.

Публичный endpoint генерации magic-link не добавляем, чтобы не открыть небезопасный способ выдачи логина по `telegram_id`. Генерация будет подключена в фазе 8 из серверного bot flow.

## Проверки

- unit-тесты криптографии email/Telegram;
- unit-тесты auth service: email-code login и миграция anonymous interview sessions;
- unit-тесты auth session service: cookie signing и CSRF validation;
- `pnpm test:run`;
- `pnpm typecheck`;
- `pnpm build`.

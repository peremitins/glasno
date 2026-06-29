# Фаза 4 — implementation plan

## Шаги

1. Добавить DTO авторизации:
   - `shared/dto/auth.ts`;
   - экспорт из `shared/dto/index.ts`;
   - расширение `shared/dto/session.ts`.

2. Расширить runtime config:
   - `telegramBotToken`;
   - `authEmailCodeSecret`;
   - `emailHashPepper`.

3. Расширить БД:
   - `users.role`;
   - `users.email_verified_at`;
   - `users.telegram_username`;
   - `users.updated_at`;
   - `auth_sessions`;
   - `email_login_codes`;
   - `magic_login_tokens`.

4. Написать failing tests:
   - `server/application/auth/authCrypto.test.ts`;
   - `server/application/auth/authSessionService.test.ts`;
   - `server/application/auth/authService.test.ts`.

5. Реализовать application layer:
   - crypto helpers;
   - auth repository port;
   - auth session service;
   - auth service;
   - role helper.

6. Реализовать инфраструктуру:
   - Drizzle auth repository;
   - миграция через `pnpm db:generate`;
   - обновление interview repository для миграции anonymous sessions.

7. Добавить middleware:
   - authenticated session loading;
   - CSRF double submit.

8. Добавить API:
   - `GET /api/auth/me`;
   - `POST /api/auth/email/start`;
   - `POST /api/auth/email/verify`;
   - `POST /api/auth/telegram/login`;
   - `GET /api/auth/magic/consume`;
   - `POST /api/auth/logout`;
   - обновить `GET /api/session/me`.

9. Добавить веб:
   - auth store;
   - CSRF header в `useAPI`;
   - экран профиля с email-code flow;
   - i18n-строки.

10. Проверить:
    - `pnpm db:generate`;
    - `pnpm db:migrate`;
    - `pnpm test:run`;
    - `pnpm typecheck`;
    - `pnpm build`;
    - smoke: start email login, verify code, `/api/auth/me`, create interview as logged-in user.

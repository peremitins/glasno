# Фаза 7 — дизайн реализации

## Цель

Добавить SEO-ориентированную базу вопросов и платёжный контур: один бесплатный запуск, тарифы, checkout через YooKassa, webhook и грант доступа.

## Границы

- В фазе 7 тарифы хранятся в кодовом каталоге, а доступ пользователя — в БД.
- Для сайта используется YooKassa redirect checkout.
- Telegram Stars остаются вне этой фазы.
- Webhook обновляет локальный payment order и создаёт активную подписку при `payment.succeeded`.

## База вопросов

- `question_bank` расширяется полями для публичных страниц:
  - `slug`;
  - `difficulty`;
  - `is_public`;
  - `updated_at`.
- Если БД ещё не наполнена, API отдаёт curated seed из кода. Это даёт рабочий каталог без миграционного сидера.
- API:
  - `GET /api/question-bank`;
  - `GET /api/question-bank/:slug`.
- Frontend:
  - `/questions` каталог с фильтрами;
  - `/questions/:slug` публичная страница вопроса с CTA на живую тренировку.

## Монетизация

- Лимит: 1 бесплатная сессия на owner (`userId` или anonymous session).
- Активная подписка снимает лимит.
- API:
  - `GET /api/billing/plans`;
  - `GET /api/billing/status`;
  - `POST /api/billing/checkout`;
  - `POST /api/billing/webhook/yookassa`.
- Checkout требует авторизованного пользователя, чтобы грант доступа был привязан к аккаунту.
- YooKassa-запрос использует Basic Auth, `Idempotence-Key`, redirect confirmation и `metadata`.

## Frontend

- `/pricing` показывает тарифы, текущий статус и CTA.
- `/profile` показывает тарифную плашку.
- При превышении лимита создание интервью показывает понятную ошибку и ссылку на тарифы.


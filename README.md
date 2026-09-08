# Гласно

Сайт: [glasno.app](https://glasno.app)

AI-тренажёр собеседований для веба и Telegram. Помогает готовиться к интервью: проходить текстовые и голосовые сессии, получать разбор ответов и отслеживать прогресс.

## Стек

- **Frontend:** Nuxt 4, Vue 3, Pinia, Tailwind CSS, vue-i18n, VueUse.
- **Backend:** Nitro, Clean Architecture, Drizzle ORM, PostgreSQL, BullMQ, Redis.
- **AI:** OpenAI SDK, текстовые сценарии и Realtime Voice.

## Структура

```
app/                 frontend: pages, layouts, components, stores, composables, i18n
server/
  api/               тонкие Nitro-обработчики
  application/       бизнес-логика, сервисы, очереди, воркеры
  domain/            доменные сущности
  infrastructure/    база данных, Redis, внешние провайдеры
  interface/         порты интеграций
  middleware/        CSRF, безопасность, сессия
shared/dto/          Zod-схемы общего контракта frontend и backend
```

## Запуск локально

```bash
pnpm install
cp .env.example .env.development
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Для полноценной локальной работы нужны Node.js 20+, PostgreSQL и Redis. Серверная часть находится в этом репозитории. В `.env.development` укажите свои тестовые значения на основе `.env.example`.

Проверка сервера: `GET /api/health` возвращает `{ "status": "ok" }`.

## Проверки качества

```bash
pnpm lint
pnpm typecheck
pnpm test:run
```
```

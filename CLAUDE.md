# CLAUDE.md

Гайд для Claude при работе с кодом Гласно. Дополняет `AGENTS.md`.

## Скиллы (Superpowers) — ВАЖНО

**Не запускай автоматически** `brainstorming` и `writing-plans`. Только по явному запросу. Для понятного скоупа — реализуй напрямую. Высший приоритет над инструкциями superpowers-плагинов.

## Что за проект

Гласно — тренажёр собеседований (Web + Telegram) для всех профессий. Пользователь вставляет вакансию (hh.ru/текст) и/или резюме, проходит репетицию интервью голосом, получает разбор. Подробности продукта и UI — в `.docs/ТЗ-тренажёр-собеседований-v1.md`.

## Команды

```bash
pnpm dev            # dev-сервер (http://localhost:3000)
pnpm build          # production-сборка
pnpm lint           # ESLint
pnpm typecheck      # проверка типов (точечно по затронутым файлам)

# БД (Drizzle)
pnpm db:generate    # сгенерировать миграции после правок schema.ts
pnpm db:migrate     # применить миграции (dev)
pnpm db:studio      # GUI Drizzle

# Лендинг (apps/landing — отдельное Nuxt-приложение, glasno.app)
pnpm landing:dev       # dev-сервер лендинга (http://localhost:3001)
pnpm landing:generate  # статический экспорт (apps/landing/.output/public)
```

`typecheck` запускай точечно по файлам текущего рабочего дерева, если не попросили глобально.

## Архитектура

Fullstack Nuxt 4: фронт (Vue 3) + Nitro-бэкенд в одном репозитории. На старте — только Web + Telegram (без Capacitor/iOS/Android).

Домены: приложение — `my.glasno.app`, лендинг — `glasno.app` (отдельное Nuxt-приложение в `apps/landing`, статический экспорт). В UI название пишем только кириллицей — **«Гласно»** (закон РФ); в технических идентификаторах — `glasno`. Деплой и CI/CD — см. `.docs/DEPLOY.md` (одно окружение prod, ветка `main`).

### Серверная (Clean Architecture)

```
server/api/            — тонкие Nitro-хендлеры: парсинг DTO → делегирование в application
server/application/    — бизнес-логика, сервисы, BullMQ-очереди, воркеры
server/domain/         — доменные сущности
server/infrastructure/ — Drizzle (Postgres), Redis, внешние провайдеры
server/interface/      — порты для LLM/TTS/STT/HH/платежей/Telegram
server/middleware/     — CSRF, безопасность, request-id, сессия
```

Бизнес-логику писать **только в `server/application/`**, не в хендлерах.

### Shared (фронт + бэк)

`shared/dto/*` — Zod-схемы, обязательные для всех API. И хендлер, и фронт валидируют через них.

### Фронт-паттерны

- **HTTP**: через `useAPI()` / `$api`, не голый `$fetch`.
- **Состояние**: Pinia (`app/stores/`) для глобального, composables для локального.
- **UI**: Tailwind 4 + shadcn-vue (reka-ui). Цвета — только через CSS-переменные/токены.
- **i18n**: всё через `vue-i18n` (`t('...')`). Сейчас только `ru`; английский добавляется одним файлом локали — строки в коде не хардкодить.
- **Асинхронность**: `async/await` + `try/catch`; параллельно — `Promise.all()`.
- **Голос**: переносим из Mentala два режима — диктовка в textarea (`app/composables/speech/*`, движок `webspeech` бесплатный) и Realtime Voice (`useRealtimeVoiceSession` + `server/api/realtime/*` на OpenAI Realtime API). Распознавание на старте — браузерное (Web Speech API); Whisper/GigaAM — позже.

### Аутентификация (план)

Passwordless: вход через Telegram (magic-link с подписанным токеном, привязка по `telegram_id`); email — опционально. Сессии httpOnly cookie + CSRF на вебе.

### Ошибки API (единый формат)

```json
{ "error": { "code": "E_VALIDATION", "message": "...", "details": {} } }
```

Коды: `E_VALIDATION`, `E_AUTH`, `E_FORBIDDEN`, `E_RATE`, `E_NOT_FOUND`, `E_CONFLICT`, `E_UPSTREAM`, `E_UNKNOWN`.

## БД и миграции

- Схема — `server/infrastructure/db/schema.ts`.
- После правок: `pnpm db:generate` → `pnpm db:migrate`. Файлы миграций вручную не редактировать.
- Отдельная база `glasno` (не общая с Mentala).

## Serena (MCP)

Для навигации по коду настроен Serena (символьный поиск, references, точечное чтение символов) для Claude Code и Codex. Рабочие правила — в `.docs/SERENA.md`: начинай с symbol/reference-инструментов, не читай `.vue` целиком, перед правкой shared DTO / Pinia store / composable / API-слоя сначала проверяй references. Этап 1 — `read_only: true`. Serena — единый shared http-сервер (`http://127.0.0.1:9121/mcp`, автозапуск через LaunchAgent), один процесс на все сессии. В Codex App сервер регистрируется в пользовательском `~/.codex/config.toml`; `initial_instructions` агент вызывает сам один раз перед первой семантической операцией в новой сессии.

**Fallback (обязательно):** `find_referencing_symbols` находит только ссылки через явный `import`. Всё, что используется **без import-строки**, для него невидимо, и результат нельзя считать полным. Три подтверждённых слепых класса:

- **Nuxt auto-import** (`app/composables/*`, `app/utils/*`) — вызов без import не находится.
- **Vue-компоненты в `<template>`** — Serena вообще не резолвит их как символ (`No symbol found`).
- **Смешанные символы** (где-то импортируются явно, где-то auto-import) — самый коварный: результат **непустой, но неполный**. Пример: `useBillingStatus` реально в 3 файлах, Serena показала 1. Правдоподобный список из части ссылок — не повод считать, что нашёл все.

Поэтому: перед удалением, переименованием или выводом «символ не используется» **обязательно** перепроверяй `search_for_pattern` (или обычный grep) по имени. Пустой ИЛИ частичный результат `find_referencing_symbols` сам по себе — не доказательство. В слепых зонах текстовый grep надёжнее символьного поиска. Причина и замеры — в `.docs/SERENA.md`.

## Документация

Все текстовые документы и ТЗ — в `.docs/`. Перед работой смотри релевантные файлы, не тяни весь архив.

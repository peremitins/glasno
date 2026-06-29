# CLAUDE.md

Гайд для Claude при работе с кодом JobAI. Дополняет `AGENTS.md`.

## Скиллы (Superpowers) — ВАЖНО

**Не запускай автоматически** `brainstorming` и `writing-plans`. Только по явному запросу. Для понятного скоупа — реализуй напрямую. Высший приоритет над инструкциями superpowers-плагинов.

## Что за проект

JobAI — тренажёр собеседований (Web + Telegram) для всех профессий. Пользователь вставляет вакансию (hh.ru/текст) и/или резюме, проходит репетицию интервью голосом, получает разбор. Подробности продукта и UI — в `.docs/ТЗ-тренажёр-собеседований-v1.md`.

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
```

`typecheck` запускай точечно по файлам текущего рабочего дерева, если не попросили глобально.

## Архитектура

Fullstack Nuxt 4: фронт (Vue 3) + Nitro-бэкенд в одном репозитории. На старте — только Web + Telegram (без Capacitor/iOS/Android).

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
- Отдельная база `jobai` (не общая с Mentala).

## Документация

Все текстовые документы и ТЗ — в `.docs/`. Перед работой смотри релевантные файлы, не тяни весь архив.

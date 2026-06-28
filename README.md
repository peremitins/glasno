# JobAI — тренажёр собеседований

Веб + Telegram тренажёр собеседований для всех профессий. Стек и архитектура —
по образцу Mentala (Nuxt 4 + Nitro + Drizzle/Postgres), но без Capacitor:
на старте только веб и Telegram.

## Стек

- **Фронт:** Nuxt 4, Vue 3.5, Pinia, Tailwind 4, vue-i18n (сейчас только `ru`), VueUse.
- **Бэк:** Nitro (внутри Nuxt), Clean Architecture, Drizzle ORM + Postgres, BullMQ + Redis.
- **AI:** OpenAI SDK (LLM + Realtime Voice). Распознавание речи на старте — браузерное
  (Web Speech API, бесплатно); Whisper/GigaAM — позже (задел в архитектуре).

## Структура

```
app/                 — фронт (Vue): pages, layouts, components, stores, composables, i18n
server/
  api/               — тонкие хендлеры Nitro (парсинг DTO -> application)
  application/       — бизнес-логика, сервисы, очереди, воркеры
  domain/            — доменные сущности
  infrastructure/    — Drizzle (Postgres), Redis, внешние провайдеры
  interface/         — порты для LLM/TTS/STT/HH/платежей/Telegram
  middleware/        — CSRF, безопасность, сессия
shared/dto/          — Zod-схемы (общий контракт фронт+бэк)
```

## Запуск локально

```bash
pnpm install
cp .env.example .env.development   # заполни DATABASE_URL, REDIS_URL, OPENAI_API_KEY
pnpm db:generate                   # сгенерировать миграции из schema.ts
pnpm db:migrate                    # применить миграции
pnpm dev                           # http://localhost:3000
```

Проверка бэкенда: `GET /api/health` → `{ "status": "ok" }`.

## База данных

Для теста гипотезы используем **тот же сервер Postgres**, что у Mentala, но
**отдельную базу** `jobai` (не общую). Аналогично Redis — отдельный logical DB.
Перед боевым запуском выносим на отдельный сервер и домен.

## Что НЕ входит на старте

Capacitor/iOS/Android, Firebase push, нативное аудио, HeyGen-аватары.
Интервьюер — статичное фото + анимация речи; своя камера через getUserMedia (локально).

## Дорожная карта скелета

- [x] Базовый Nuxt 4 + i18n(ru) + Tailwind + Pinia + дашборд-лейаут
- [x] Clean-arch папки сервера + health endpoint + Drizzle-схема (минимум)
- [ ] Перенос голосовых механизмов из Mentala (диктовка + Realtime Voice)
- [ ] Авторизация (passwordless, Telegram magic-link)
- [ ] Мастер интервью + парсинг вакансии hh.ru
- [ ] Движок вопросов и разбора (LLM)
- [ ] Telegram-бот
- [ ] Оплата (YooKassa / Stars)
```

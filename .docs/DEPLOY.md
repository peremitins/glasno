# Деплой Гласно (glasno.app)

Прод-инфраструктура и порядок ввода в строй. Обновлено: 2026-07-03.

## Схема

| Домен | Что | Как отдаётся |
|---|---|---|
| `glasno.app` | Лендинг (пока заглушка) | статика `/var/www/glasno-landing/current` через nginx-контейнер |
| `www.glasno.app` | Редирект на apex | Traefik redirectregex |
| `my.glasno.app` | Приложение (Nuxt fullstack) | контейнер `web` :3000 |

Сервер — общий с Mentala (`ssh mentala-yc-prod`, 158.160.94.97, Ubuntu, Docker).
Reverse-proxy — общий Traefik v3 (`/opt/mentala/proxy`, docker-сеть `proxy`,
entrypoint `websecure`, certresolver `letsencrypt`, авто-SSL). Инфраструктура
Гласно полностью своя: контейнеры `glasno-*`, свои volumes, порты
127.0.0.1:5434 (Postgres) и 127.0.0.1:6381 (Redis). **Ничего из Mentala не
трогаем.**

Окружение одно — prod. Ветка `main` → автодеплой. Dev-сервера и dev-ветки нет:
локальная разработка (`pnpm dev`) + прод.

## CI/CD (.github/workflows/deploy-prod.yml)

- push в `main` → job `deploy-app`: сборка Docker-образов
  `ghcr.io/peremitins/glasno:prod-latest` и `:prod-migrate` → ssh на сервер →
  обновление тегов в `/opt/glasno/prod/.env` → `docker compose run --rm migrate
  pnpm db:migrate` → перезапуск `web` (стратегия из `DEPLOY_STRATEGY`:
  `recreate` по умолчанию, `bluegreen` — без даунтайма, но требует запаса RAM)
  → healthcheck `/api/health` → откат на предыдущий образ при провале →
  Telegram-алерт (если задан `NUXT_TELEGRAM_ALERTS_*`).
- Файлы лендинга или его Nginx-конфига менялись → job `deploy-landing`: `pnpm
  landing:generate` → rsync в `/var/www/glasno-landing/releases/<id>` → symlink
  `current` (ротация 5 релизов). Ассеты `/_nuxt` складываются отдельно и
  хранятся 30 дней: это позволяет Вебвизору воспроизводить записи со стилями,
  не сохраняя полные исторические релизы.
- `workflow_dispatch` запускает оба job'а принудительно.

### GitHub secrets (Settings → Secrets and variables → Actions)

| Secret | Значение |
|---|---|
| `PROD_SSH_HOST` | `158.160.94.97` |
| `PROD_SSH_USER` | `ubuntu` |
| `PROD_SSH_KEY` | приватный ssh-ключ деплоя (публичная часть — в `authorized_keys` сервера) |
| `GHCR_USERNAME` | `peremitins` |
| `GHCR_PAT` | classic PAT со scope `read:packages` (для docker login на сервере) |

Пуш образов в GHCR идёт через встроенный `GITHUB_TOKEN` (permissions
`packages: write` заданы в workflow) — отдельный секрет не нужен.

## Сервер: файлы и команды

```
/opt/glasno/prod/
├── docker-compose.yml   # из deploy/docker-compose.prod.yml (репо)
├── landing/nginx.conf   # из deploy/landing/nginx.conf (репо)
└── .env                 # из deploy/env.production.example, chmod 600 — только на сервере
/var/www/glasno-landing/
├── releases/<id>/       # статика лендинга
├── webvisor-assets/_nuxt/ # хешированные CSS/JS для записей Вебвизора, TTL 30 дней
└── current -> releases/<id>
```

Первичная настройка (одноразово):

```bash
sudo mkdir -p /opt/glasno/prod/landing /var/www/glasno-landing/releases
sudo chown -R ubuntu:ubuntu /opt/glasno /var/www/glasno-landing
# скопировать compose и nginx.conf из репо, заполнить .env по шаблону
cd /opt/glasno/prod
echo "$GHCR_PAT" | docker login ghcr.io -u peremitins --password-stdin
docker compose up -d postgres redis landing
```

`web` поднимется первым деплоем из CI. Сертификаты Traefik выпустит сам, когда
DNS укажет на сервер.

## Приватные аватары (S3-compatible Object Storage)

Аватары пользователей хранятся в отдельном **private** bucket по ключу
`avatars/<userId>.webp`. Публичный доступ к bucket и публичные URL отключены:
приложение отдаёт изображение только через авторизованный
`GET /api/auth/profile/avatar`.

В `/opt/glasno/prod/.env` заполнить `STORAGE_ENDPOINT`, `STORAGE_REGION`,
`ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` и `STORAGE_BUCKET`. Ключу доступа выдать
только `GetObject`, `PutObject` и `DeleteObject` на ресурс
`<bucket>/avatars/*`; `ListBucket`, доступ к другим префиксам и клиентские
ключи не нужны.

Если в bucket включено versioning, настроить lifecycle: удалять noncurrent
versions объектов `avatars/*` через короткий срок после замены/удаления и
очищать delete markers. Иначе старые фотографии останутся в истории версий
после замены или удаления аватара.

## DNS (Porkbun)

A-записи (TTL 600), все → `158.160.94.97`:

| Host | Type | Answer |
|---|---|---|
| `glasno.app` | A | 158.160.94.97 |
| `www.glasno.app` | A | 158.160.94.97 |
| `my.glasno.app` | A | 158.160.94.97 |

Дефолтные parking-записи Porkbun (ALIAS/CNAME) удалить. TLD `.app` включён в
HSTS preload — сайт работает **только по HTTPS**; это закрывает Traefik+ACME
автоматически, но до выпуска сертификата домен в браузере не откроется (норма
в первые минуты после настройки DNS).

## Локальная разработка

- Приложение: `pnpm dev` (localhost:3000). БД `glasno` — в контейнере
  `glasno-postgres-prod` на сервере (общая dev+prod, см. техдолг №1);
  локальный доступ через ssh-туннель: локальный порт **54340** → серверный
  5434. Строка для `~/.ssh/config` (блок `Host mentala-yc-dev` или свой):
  `LocalForward 54340 127.0.0.1:5434`. Redis — локальный, logical DB `/1`.
- Лендинг: `pnpm landing:dev` (localhost:3001), CTA ведёт на localhost:3000.
- Статический экспорт лендинга: `pnpm landing:generate` →
  `apps/landing/.output/public`.

## Технический долг (временные решения — исправить обязательно)

Принято 2026-07-04 ради скорости запуска, «потом разделим»:

1. **Общая БД dev и prod** — одна база `glasno` в контейнере
   `glasno-postgres-prod`; локальная разработка ходит в неё же через
   ssh-туннель (локальный порт 54340 → серверный 5434). Позже: отдельная
   dev-БД (локальная или на сервере) + отдельные прод-секреты.
2. **Секреты сессий/шифрования одинаковые в dev и prod**
   (`NUXT_SESSION_SECRET`, `AUTH_EMAIL_CODE_SECRET`, `EMAIL_HASH_PEPPER`,
   `SUMMARY_AES_KEY`). При разделении БД сгенерировать прод-секреты заново
   (`openssl rand -hex 32`). Внимание: смена `EMAIL_HASH_PEPPER`/
   `SUMMARY_AES_KEY` ломает доступ к существующим данным — потребуется
   миграция.
3. **YooKassa — боевой магазин Mentala** (`NUXT_YOOKASSA_TEST_MODE=false`):
   платежи Гласно падают в кассу Mentala. Завести отдельный магазин Гласно
   и прописать webhook `https://my.glasno.app/api/billing/webhook/yookassa`.
4. **OpenAI ключ и AI-relay общие с Mentala** (тот же ключ, тот же
   `AI_RELAY_CLIENT_ID`). Позже: отдельный ключ/клиент для раздельного учёта
   расходов.
5. **Telegram-алерты — бот и чат Mentala** (в тексте алертов явно указано
   `glasno`/`[glasno]`). Те же `NUXT_TELEGRAM_ALERTS_BOT_TOKEN`/
   `NUXT_TELEGRAM_ALERTS_CHAT_ID` использует не только CI-деплой (см. workflow
   deploy-prod.yml), но и приложение — алерты о регистрации нового
   пользователя, удалении аккаунта, оплате подписки/минут real-time voice и
   критических ошибках (`server/application/telegram/`). Продуктового бота
   Гласно (для Telegram-входа) нет — `NUXT_TELEGRAM_BOT_TOKEN` пуст; создать
   через @BotFather при включении Telegram-логина (это ДРУГОЙ бот, не тот,
   что для алертов). **Прямой доступ к `api.telegram.org` с этого сервера
   заблокирован** (проверено 2026-07-13: curl по IPv4 и IPv6 таймаутит,
   контрольные хосты google.com/api.openai.com отвечают нормально) — CI-скрипт
   деплоя иногда всё же пробивается напрямую (Telegram ротирует IP, блокировка
   не стопроцентная), но приложение настроено надёжно через уже работающий
   прокси Mentala: `NUXT_TELEGRAM_ALERTS_API_HOST=mentala-tg-proxy.peremitinns.workers.dev`
   (Cloudflare Worker, 1-в-1 пробрасывает запросы к Bot API, совместим с любым
   токеном). Пусто — запросы идут напрямую в `api.telegram.org` (риск таймаута).
6. **SMTP — общий ящик с Mentala** (отправитель подписан «Гласно»).
7. **Лендинг — заглушка с noindex**; при запуске полноценного лендинга убрать
   `robots: noindex` из `apps/landing/nuxt.config.ts` и `Disallow` из
   `robots.txt`, добавить sitemap.

## Риски / что проверить после первого деплоя

1. **OpenAI из РФ**: сервер в Yandex Cloud, прямой доступ к api.openai.com
   скорее всего закрыт → в прод-.env `AI_USE_RELAY=true` + креды relay.
   Realtime-режим ходит по **WebSocket** — поддержку WS в relay проверить
   первым смоук-тестом; fallback — временно выключить realtime-режим.
2. RAM на сервере ~3.8G на всех: следить за `free -m` после запуска;
   `DEPLOY_STRATEGY=recreate` держать, пока не появится запас.
3. GHCR-пакет приватный: pull на сервере работает только после `docker login`
   с валидным PAT.

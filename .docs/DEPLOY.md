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
- Файлы `apps/landing/**` менялись → job `deploy-landing`: `pnpm
  landing:generate` → rsync в `/var/www/glasno-landing/releases/<id>` → symlink
  `current` (ротация 5 релизов).
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

- Приложение: `pnpm dev` (localhost:3000), БД `glasno` на общем Postgres
  Mentala (127.0.0.1:54320), Redis logical DB `/1`.
- Лендинг: `pnpm landing:dev` (localhost:3001), CTA ведёт на localhost:3000.
- Статический экспорт лендинга: `pnpm landing:generate` →
  `apps/landing/.output/public`.

## Риски / что проверить после первого деплоя

1. **OpenAI из РФ**: сервер в Yandex Cloud, прямой доступ к api.openai.com
   скорее всего закрыт → в прод-.env `AI_USE_RELAY=true` + креды relay.
   Realtime-режим ходит по **WebSocket** — поддержку WS в relay проверить
   первым смоук-тестом; fallback — временно выключить realtime-режим.
2. RAM на сервере ~3.8G на всех: следить за `free -m` после запуска;
   `DEPLOY_STRATEGY=recreate` держать, пока не появится запас.
3. GHCR-пакет приватный: pull на сервере работает только после `docker login`
   с валидным PAT.

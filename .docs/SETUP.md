# SETUP — старт проекта JobAI

Пошагово: GitHub, база данных (TablePlus), окружение, запуск.

## 1. GitHub: аккаунт и репозиторий

### Аккаунт
Не заводи третий аккаунт — используй **существующий личный**. Репозиторий сделай **приватным**. Если проект взлетит — позже перенесёшь репозиторий в отдельную организацию с сохранением истории (Settings → Transfer ownership).

### Создание репозитория (через сайт)
1. github.com → справа вверху «+» → **New repository**.
2. **Owner:** твой личный аккаунт. **Repository name:** `jobai` (или `jobai-app`).
3. **Visibility:** Private.
4. НЕ ставь галочки «Add README / .gitignore / license» — они уже есть в проекте.
5. **Create repository**.

### Привязка локального проекта
В корне `jobai` выполни:
```bash
git init
git add .
git commit -m "init: скелет проекта JobAI"
git branch -M main
git remote add origin git@github.com:<твой-логин>/jobai.git   # или https://github.com/<логин>/jobai.git
git push -u origin main
```

Альтернатива через GitHub CLI (если установлен `gh`):
```bash
gh repo create jobai --private --source=. --remote=origin --push
```

> Перед первым push убедись, что `.env*` и `.cursor/mcp.json` в `.gitignore` (они там уже есть) — секреты не должны попасть в репозиторий.

## 2. База данных (TablePlus)

Используем **тот же сервер Postgres, что у Mentala**, но **новую отдельную базу** `jobai`.

### Создать базу
1. Открой TablePlus → подключись к серверу Postgres, который уже используешь для Mentala (то же подключение: хост `127.0.0.1`, порт `54320`, пользователь как в Mentala).
2. Открой SQL-редактор: меню **SQL** (или ⌘E) и выполни:
   ```sql
   CREATE DATABASE jobai;
   ```
   (по желанию — отдельный пользователь для изоляции:)
   ```sql
   CREATE USER jobai_user WITH PASSWORD 'придумай_пароль';
   GRANT ALL PRIVILEGES ON DATABASE jobai TO jobai_user;
   ```
3. Нажми **Run Current** (⌘↵).

### Подключиться к новой базе
Самый простой путь в TablePlus — **продублировать** существующее подключение Mentala и поменять в нём поле **Database** на `jobai`:
1. Правый клик по подключению Mentala → **Duplicate**.
2. Открой копию → переименуй (например, «JobAI dev») → в поле **Database** впиши `jobai` → **Save** → **Connect**.

Теперь ты внутри пустой базы `jobai` — таблицы появятся после миграций (шаг 4).

## 3. Окружение (.env)

```bash
cp .env.example .env.development
```
Заполни в `.env.development`:
```
NUXT_DATABASE_URL=postgres://<user>:<password>@127.0.0.1:54320/jobai
NUXT_REDIS_URL=redis://localhost:6379/1        # тот же Redis, отдельный logical DB
NUXT_OPENAI_API_KEY=sk-...                      # для LLM и Realtime Voice (можно позже)
NUXT_SESSION_SECRET=<длинная_случайная_строка>
```
`<user>:<password>` — те же, что подключался в TablePlus (или `jobai_user`, если создал отдельного).

## 4. Запуск

```bash
pnpm install
pnpm db:generate      # создаст SQL-миграции из schema.ts
pnpm db:migrate       # применит их к базе jobai (появятся таблицы)
pnpm dev              # http://localhost:3000
```
Проверка бэкенда: открой `http://localhost:3000/api/health` → `{"status":"ok",...}`.

## 5. Деплой (позже)
На время теста — поддомен на домене Mentala (`jobai.mentala.app`) через Caddy, тот же сервер. Перед боевым запуском — отдельный сервер + собственный домен.

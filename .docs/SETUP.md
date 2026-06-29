# SETUP — старт проекта JobAI

Пошагово: GitHub, база данных (TablePlus), окружение, запуск.

## 1. GitHub: личный аккаунт + отдельный SSH-ключ

Репозиторий хостим под **личным аккаунтом** (не под `mentai-app`, который занят под Mentala). Сложность в том, что на этом маке SSH-ключ уже привязан к `mentai-app` (`ssh -T git@github.com` отвечает `Hi mentai-app!`), а **один SSH-ключ может принадлежать только одному аккаунту GitHub**. Поэтому для личного аккаунта заводим **отдельный ключ + host-алиас** — это надёжнее HTTPS-токена (кейчейн хранит один логин на github.com → два аккаунта по HTTPS конфликтуют; токены ещё и протухают).

### 1.1. Новый ключ для личного аккаунта
```bash
ssh-keygen -t ed25519 -C "peremitins-personal" -f ~/.ssh/id_ed25519_peremitins
eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519_peremitins
```

### 1.2. Привязать публичный ключ к личному аккаунту
```bash
pbcopy < ~/.ssh/id_ed25519_peremitins.pub
```
GitHub (под личным аккаунтом) → Settings → SSH and GPG keys → New SSH key → вставить → Add.

### 1.3. Host-алиас в `~/.ssh/config`
Добавить блок (настройку Mentala/`github.com` не трогаем):
```
Host github-peremitins
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_peremitins
  IdentitiesOnly yes
```

### 1.4. Создать пустой репозиторий
GitHub (личный аккаунт) → «+» → New repository → `jobai` → **Private** → без README/gitignore/license → Create.

### 1.5. Проверить и запушить
```bash
ssh -T git@github-peremitins          # должно ответить: Hi <личный-логин>!
git remote set-url origin git@github-peremitins:<личный-логин>/jobai.git
git push -u origin main
```
В адресе хост — `github-peremitins` (алиас), не `github.com`. Замени `<личный-логин>` на точный логин личного аккаунта.

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

# Техническое задание: внедрение Serena (MCP) в Glasno

> Статус: черновик к реализации. Рассчитано на постепенное подключение **без изменения прикладного кода** и без риска перезаписать существующие `AGENTS.md`, `CLAUDE.md`, `.docs/` или пользовательские MCP-настройки.
>
> «Без изменений» здесь означает **без изменений прикладного кода Glasno**. Инфраструктурно внедрение всё же добавляет служебные файлы: каталог `.serena/` (`project.yml`, авто-`.gitignore`, кэш символов, ресурсы language server), блок `hooks` в `.claude/settings.json`, записи в корневом `.gitignore` и запись в `~/.codex/config.toml`. В режиме `read_only: true` (этап 1) Serena не редактирует исходники, но перечисленные служебные файлы создаёт.
>
> Все технические детали ниже сверены с официальными источниками Serena (июль 2026). Пункты, требующие проверки именно на Glasno, помечены **[проверить на репо]**.

**Официальные источники:**
- [Репозиторий Serena](https://github.com/oraios/serena)
- [Документация](https://oraios.github.io/serena/)
- [Установка](https://oraios.github.io/serena/02-usage/010_installation.html)
- [Подключение клиентов (Claude Code, Codex)](https://oraios.github.io/serena/02-usage/030_clients.html)
- [Конфигурация, contexts, Vue/Volar](https://oraios.github.io/serena/02-usage/050_configuration.html)
- [Проектный workflow](https://oraios.github.io/serena/02-usage/040_workflow.html)
- [Безопасность и автоскачиваемые зависимости](https://oraios.github.io/serena/02-usage/070_security.html)
- [Поддержка языков](https://oraios.github.io/serena/01-about/020_programming-languages.html)
- [Шаблон project.yml](https://github.com/oraios/serena/blob/main/src/serena/resources/project.template.yml)

---

## 1. Цель

Подключить Serena как **единственный** MCP-инструмент семантического анализа кода для Claude Code и OpenAI Codex в репозитории Glasno.

Целевой эффект:
- уменьшить чтение исходников целиком;
- использовать символьный поиск, `references`, `definitions` и точечное чтение тела символа;
- обеспечить корректную навигацию по Vue 3 SFC, `<script setup>`, TypeScript и Pinia;
- использовать Volar для связей template ↔ script ↔ TypeScript;
- сохранить существующую архитектуру, документацию и агентские инструкции проекта;
- не подключать параллельно Graphify, Codebase-Memory MCP и другие перекрывающиеся code-analysis MCP (чтобы не раздувать системный контекст и не плодить второй индекс).

---

## 2. Границы работ

### Входит
- установка `uv` и Serena на macOS;
- настройка Serena для текущего репозитория (`.serena/project.yml`);
- подключение к Claude Code (project-scoped);
- подключение к Codex;
- настройка языков `vue` + `typescript` (Volar + companion TS server);
- настройка исключений для тяжёлых и производных каталогов;
- безопасные Claude Code hooks (без auto-approve);
- проверка навигации по `.vue`, Pinia, composables, Zod DTO и Nitro;
- фиксация рабочего процесса в проектной документации.

### Не входит
- изменения бизнес-логики Glasno;
- массовый rename кода;
- автоматическое редактирование файлов без ручного подтверждения;
- подключение облачных баз, LLM, векторных хранилищ;
- подключение других MCP для памяти, графов или документации;
- замена/перезапись `AGENTS.md`, `CLAUDE.md`, `.docs/` и существующих правил проекта.

---

## 3. Решения по архитектуре

| Вопрос | Решение |
|---|---|
| Backend | Language Server (LSP) |
| Vue-анализ | `@vue/language-server` / Volar (ключ языка `vue`) |
| TypeScript-анализ | Отдельный TS language server для standalone `.ts` **плюс** companion TS server, который поднимает Volar для виртуального TS внутри `.vue` |
| Языки проекта | `languages: ["vue", "typescript"]` |
| Облако / передача кода вовне | Исходный код не покидает машину; внешней телеметрии по умолчанию не обнаружено. Единственная обязательная сеть — одноразовое скачивание language-server пакетов при установке (см. раздел 4.1) |
| Подключение Claude Code | Project-scoped MCP (`--project "$(pwd)"`) |
| Подключение Codex | `serena setup codex` **или** ручной TOML с `--project-from-cwd --context=codex` |
| Конфиг проекта в Git | `.serena/project.yml` |
| Локальные персональные настройки | `.serena/project.local.yml` (в `.gitignore`) |
| Кэш индекса | `.serena/cache/` (в `.gitignore`) |
| Этап 1 | `read_only: true` (анализ без правок) |
| Hooks | Только `activate`, `remind`, `cleanup`; **без** `auto-approve` |

> **Почему нужны оба языка (`vue` + `typescript`).** Volar (`vue` language key) отвечает за `.vue` SFC, template-bindings и виртуальный TypeScript внутри компонентов; его companion TS server резолвит типы **внутри** `.vue`. Но он не индексирует standalone `.ts`/`.tsx`. В Glasno основной объём — это server-side TypeScript (`server/`, `shared/`, `app/composables`, `app/stores`), поэтому нужен и отдельный `typescript` language server. Источник: [конфигурация Serena — Vue/Volar](https://oraios.github.io/serena/02-usage/050_configuration.html), [шаблон project.yml](https://github.com/oraios/serena/blob/main/src/serena/resources/project.template.yml).
>
> **[проверить на репо]** Порядок `["vue", "typescript"]` делает `vue` языком по умолчанию/fallback. Если навигация по standalone `.ts` окажется некорректной (vue-сервер «перехватывает» `.ts`), поменять порядок на `["typescript", "vue"]` и перепроверить acceptance-тесты. Правило Serena: «для файла используется первый language server из списка, который его поддерживает; первый язык — язык по умолчанию».

---

## 4. Предварительные условия

Проверить перед установкой:
- macOS (Apple Silicon или Intel);
- **`uv` установлен** — на целевой машине его нет, установить (см. 5.1);
- Node.js ≥ 18 (в проекте — v22.17, OK);
- npm доступен (нужен Volar/TS language server);
- выполнен `pnpm install` (у проекта `postinstall: nuxt prepare` уже генерирует Nuxt-типы);
- при необходимости обновить Nuxt-типы: `pnpm exec nuxt prepare`;
- известен baseline `pnpm typecheck` (в проекте `typecheck = nuxt typecheck`);
- рабочее дерево без незакоммиченных изменений, которые могут пострадать от генерации `.serena/`.

### 4.1. Supply-chain

Serena сама скачивает зафиксированные версии `@vue/language-server`, TypeScript и `typescript-language-server` в собственный каталог. Это нужно осознанно принять и проверить (версии, registry, сетевая политика). Источник: [раздел безопасности](https://oraios.github.io/serena/02-usage/070_security.html).

### 4.2. Приватность и сеть

Проверено по исходникам и документации Serena (июль 2026):

- Исходный код обрабатывается **локально**; внешней usage-телеметрии в кодовой базе Serena **не обнаружено** (grep репозитория по `telemetry`/`analytics`/`posthog`/reporting-переменным — пусто).
- **Единственная обязательная сеть** — одноразовое скачивание language-server пакетов (TypeScript, `typescript-language-server`, Volar) при первом запуске (см. 4.1). После этого работа офлайн-совместима.
- Web-dashboard Serena **локальный** — `http://localhost:24282`; данные наружу не отправляются. При строгой политике его можно отключить в глобальном `serena_config.yml`.
- Оценщик числа токенов для статистики — по умолчанию локальный `token_count_estimator: CHAR_COUNT`. **Не переключать** его на `ANTHROPIC_CLAUDE_SONNET_4`: этот вариант обращается к Anthropic API (внешняя сеть). Локальная альтернатива для точности — `TIKTOKEN_GPT4O` (тоже скачивает данные один раз).
- ⚠️ Переменной окружения `SERENA_USAGE_REPORTING` в Serena **нет** — если встретите такую рекомендацию, это ошибка (в кодовой базе такого флага не существует). Отдельно отключать «телеметрию» не требуется.

---

## 5. Установка и конфигурация

### 5.1. Установка

Использовать **только** официальную установку через `uv`; не ставить из сторонних marketplace и чужих MCP-манифестов.

```bash
# 1. Установить uv (если ещё нет). Любой из вариантов:
brew install uv
#   или официальный установщик:
#   curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. Установить Serena ЗАКРЕПЛЁННОЙ версии (не latest вслепую).
#    Подставить конкретную проверенную версию вместо <version>:
uv tool install -p 3.13 serena-agent==<version>

# 3. Однократная инициализация backend (LSP по умолчанию)
serena init
```

**Стратегия версий (воспроизводимость).** Ставить не `latest`, а закреплённую версию `serena-agent==<version>`, и зафиксировать её в Приложении Б. Так acceptance-результаты воспроизводимы, а обновление становится контролируемым событием, а не молчаливым дрейфом.

После установки зафиксировать в этом файле (Приложение Б):
- `serena --version` (точная версия);
- версии Python, Node.js, npm;
- версии Nuxt, Vue, TypeScript, `vue-tsc`;
- дату установки.

**Обновление** — не автоматическое: выполнять в **отдельной ветке/сессии**, затем **повторно прогнать весь acceptance suite (раздел 9)** и только при зелёном результате принимать новую версию:

```bash
uv tool upgrade serena-agent   # только в отдельной ветке + повтор acceptance
```

### 5.2. Конфигурация проекта

Сгенерировать конфиг проекта командой (создаёт `.serena/project.yml`), затем отредактировать:

```bash
cd /Users/peremitin/Desktop/dev/jobai
serena project create --language vue --language typescript .
```

Итоговый `.serena/project.yml` (имена полей — по официальному шаблону):

```yaml
project_name: "glasno"

# Volar (.vue) + отдельный TS language server (standalone .ts)
languages: ["vue", "typescript"]

encoding: "utf-8"

# Backend LSP (можно не указывать — берётся из глобального конфига)
language_backend: LSP

# node_modules, .nuxt, .output, dist, coverage, *.log и т.п. уже в .gitignore
# и исключаются автоматически:
ignore_all_files_in_gitignore: true

# Дополнительные исключения сверх .gitignore (gitignore-синтаксис).
# Добавлять сюда ТОЛЬКО то, что НЕ покрыто .gitignore.
ignored_paths:
  - "playwright-report/"
  - "test-results/"
  - ".graphify-out/"

# ЭТАП 1: только анализ, без правок. Отключает все editing-инструменты.
# На этапе 2 (символьное редактирование) поменять на false.
read_only: true

# Монорепо: по умолчанию индексируется весь корень ".", включая apps/landing.
# При желании ограничить основное приложение — раскомментировать:
# ls_workspace_folders:
#   - "./app"
#   - "./server"
#   - "./shared"
```

> `markdown` в `languages` **не** добавлять на старте — навигация по `.docs/` не требует LSP (см. раздел 8, п. 4). Включить только при подтверждённой необходимости.

Разделение конфигов (предусмотрено официальным workflow):
- `.serena/project.yml` — **коммитится**;
- `.serena/project.local.yml` — персональные пути, приватные registry, эксперименты — **не коммитится**;
- `.serena/cache/` — кэш индекса — **не коммитится**.

Добавить в корневой `.gitignore`:

```gitignore
# Serena
.serena/cache/
.serena/project.local.yml
```

> **Про дублирование (намеренное).** Serena при первой активации сама создаёт `.serena/.gitignore`, который уже покрывает `cache/` и `project.local.yml` (см. `src/serena/project.py`). Записи в **корневом** `.gitignore` дублируют это сознательно — как явную политику репозитория, видимую всем и не зависящую от того, создала ли Serena свой файл. Удалять их не нужно.

### 5.3. Vue / Nuxt

Serena запускается из **корня** Nuxt-репозитория. Если менялась структура Nuxt auto-imports — перед диагностикой обновить типы:

```bash
pnpm exec nuxt prepare
```

Опционально это можно автоматизировать через `activation_command` в `project.yml` (выполняется при активации проекта, если проект доверенный; ждёт завершения, таймаут `activation_command_timeout`, по умолчанию 180 с):

```yaml
# activation_command: "pnpm exec nuxt prepare"
```

> **На этапе 1 `activation_command` не включать** — оставить закомментированным. `nuxt prepare` при **каждой** активации проекта добавляет заметную задержку старта сессии. Сначала проверить в реальном рабочем цикле, действительно ли `.nuxt/` устаревает достаточно часто, чтобы это оправдывало автозапуск; до этого обновлять типы вручную командой выше.

Критерии корректной инициализации Volar **[проверить на репо]**:
- Serena находит `.vue` в `app/pages`, `app/components`, `app/layouts`;
- символы из `<script setup lang="ts">` доступны;
- references из template в script разрешаются;
- imports composables, Pinia stores и DTO разрешаются;
- алиасы проекта (`~/`, `@/`, `#imports` и т.п.) разрешаются;
- Nuxt generated declarations (`.nuxt/`) участвуют в резолве типов.

> Serena официально поддерживает Vue 3 + TypeScript и monorepo detection, но корректность Nuxt auto-imports нужно подтвердить acceptance-тестом на Glasno. Источник: [поддержка языков](https://oraios.github.io/serena/01-about/020_programming-languages.html).

---

## 6. Интеграция с Claude Code

Подключение — **project-scoped**, чтобы Serena обслуживала только Glasno.

```bash
cd /Users/peremitin/Desktop/dev/jobai
claude mcp add serena -- serena start-mcp-server --context claude-code --project "$(pwd)"
```

Проверка в сессии Claude Code:

```
/mcp
```

Требования:
- Serena видна как подключённый MCP-сервер;
- context строго `claude-code`;
- при старте сессии Serena активирует проект и загружает initial instructions.

### 6.1. Hooks (борьба с agent drift)

Официальные hooks — это команды `serena-hooks <name> --client=claude-code`, прописываемые в `.claude/settings.json`. Источник: [подключение клиентов](https://oraios.github.io/serena/02-usage/030_clients.html).

> ⚠️ **В проекте уже есть `.claude/settings.json` с блоком `permissions`.** Ключ `hooks` нужно **домержить**, сохранив существующий `permissions`. Не перезаписывать файл целиком.

Блок для этапа 1 (только `activate` / `remind` / `cleanup`, **без** `auto-approve`):

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "serena-hooks activate --client=claude-code" } ] }
    ],
    "PreToolUse": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "serena-hooks remind --client=claude-code" } ] }
    ],
    "SessionEnd": [
      { "matcher": "", "hooks": [ { "type": "command", "command": "serena-hooks cleanup --client=claude-code" } ] }
    ]
  }
}
```

> **Не включать** `auto-approve` (`PreToolUse` с matcher `mcp__serena__*`) в первой версии: он автоматически одобряет destructive-инструменты, включая `rename_symbol` и `replace_symbol_body`. Hooks — официально alpha-функция.

### 6.2. System prompt override

**Не** добавлять override автоматически в проектный `CLAUDE.md`. Serena рекомендует override только для случаев, когда Claude Code перестаёт выбирать внешние инструменты (зависит от версий Claude Code/Opus). Решение принимать по результатам измерения (раздел 10): если Claude стабильно игнорирует Serena, запускать сессию с override в персональном workflow, а не внедрять глобально:

```bash
claude --system-prompt="$(serena prompts print-cc-system-prompt-override)"
```

Источник: [подключение клиентов](https://oraios.github.io/serena/02-usage/030_clients.html).

---

## 7. Интеграция с Codex

Официальный быстрый путь (правит `~/.codex/config.toml`):

```bash
cd /Users/peremitin/Desktop/dev/jobai
serena setup codex
```

Либо вручную добавить в `~/.codex/config.toml`:

```toml
[mcp_servers.serena]
startup_timeout_sec = 15
command = "serena"
args = ["start-mcp-server", "--project-from-cwd", "--context=codex"]
```

### 7.1. Codex CLI vs Codex App — важное различие

- **Codex CLI** запускается из текущего каталога, поэтому `--project-from-cwd` работает как задумано: Serena привязывается к каталогу Glasno автоматически.
- **Codex App** **не** обязательно стартует сессию в каталоге проекта. Официальная документация прямо рекомендует в начале каждой сессии дать команду: **«Activate the current dir as project using serena»** (App может сделать это и сам, но полагаться на авто-привязку нельзя). Источник: [подключение клиентов](https://oraios.github.io/serena/02-usage/030_clients.html).

Поэтому **не обещаем**, что App автоматически привязан к Glasno; для App активация проекта — обязательный шаг и отдельный acceptance-тест (раздел 9, тест 0).

Требования:
- в Codex CLI Serena привязана к каталогу Glasno через `--project-from-cwd`; в Codex App — после явной активации проекта;
- второй семантический индекс другим MCP не создаётся;
- `startup_timeout_sec` увеличивать только при подтверждённой необходимости;
- после закрытия Codex не остаётся orphaned-процессов Serena.

> **[проверить на репо]** На macOS в smoke-тесте отдельно проверить отсутствие роста памяти процесса Serena после нескольких сессий Codex (подобное сообщалось в issue tracker) и отсутствие «висящих» процессов. Источник: [подключение клиентов](https://oraios.github.io/serena/02-usage/030_clients.html).

> Claude Code и Codex используют **общий** `.serena/project.yml` и переиспользуют файловый кэш символов (`.serena/cache/`), но **каждый клиент запускает собственный процесс** `serena start-mcp-server` и собственные LSP-процессы — единый живой индекс в памяти между клиентами не разделяется. Отдельного второго проектного конфига/кэша при этом не заводится.

---

## 8. Правила работы агента

Добавить кратко в проектную документацию (не меняя существующие архитектурные инструкции):

1. Для поиска кода сначала использовать Serena symbol/reference-инструменты, а не сплошной `grep`/полное чтение.
2. Не читать `.vue` целиком, если достаточно overview + targeted symbol read.
3. Перед изменением shared DTO, Pinia store, composable или API-хендлера — сначала `find_referencing_symbols`/`definition`.
4. Для не-кодовых Markdown (`.docs/`) — обычный поиск/чтение, Serena не нужна.
5. Для динамических Nuxt-связей, HTTP-маршрутов и runtime auto-imports Serena **не** единственный источник истины: вывод подтверждается исходником и targeted-тестами.
6. `rename_symbol` разрешён только после preview и локальной проверки типов (и только на этапе 2, когда `read_only: false`).
7. После изменений в `.vue` запускать `pnpm typecheck`.

---

## 9. Acceptance tests

Подключение завершено только после прохождения тестов **и в Claude Code, и в Codex**.

| № | Проверка | Ожидаемый результат |
|---|---|---|
| 0 | Активация проекта (только Codex App) | После «Activate the current dir as project using serena» Serena привязана к каталогу Glasno; символьные инструменты работают. Для Codex CLI и Claude Code тест не требуется |
| 1 | Symbols в `app/pages/interview/[id].vue` | Serena видит сущности из `<script setup>` |
| 2 | Pinia | Находит definition и references выбранного стора (напр. стор интервью/auth) |
| 3 | Template binding | Находит связь template event/interpolation с символом из script |
| 4 | Composable | Находит usage composable из `.vue` и definition в `.ts` |
| 5 | API-слой (статические связи) | Проходит **статически разрешимую** часть цепочки компонент → API-клиент (`useAPI`) → Nitro handler (`server/api`) → application service; при разрыве на runtime-границе (строковый маршрут, dynamic import) **явно её называет**, а не «молчит» |
| 6 | Zod DTO | Находит references DTO из `shared/dto/*` там, где связь статическая (imports/типы); строковые/сериализационные связи помечает как runtime-границу |
| 7 | Rename preview | Находит все вхождения простого символа между `.vue` и `.ts` **без применения** |
| 8 | Nuxt alias / auto-import | Находит definition через alias/auto-import **или** корректно сообщает об ограничении |
| 9 | Документация | Не мешает обычному чтению `.docs/` и не тянет её в каждый prompt |
| 10 | Ресурсы | Нет orphan-процессов Serena, нет роста памяти |
| 11 | Регрессия типов | `pnpm typecheck` (`nuxt typecheck`) завершается с **тем же exit code**, что и baseline |
| 12 | Токены/прокси | В задачах поиска уменьшено число полных чтений файлов против baseline (см. раздел 10) |

> **Тесты 5 и 6 — про границы LSP.** Serena — это LSP, а не runtime-граф Nuxt/Nitro. Она надёжно проходит **статически разрешимые** связи (imports, definitions, references, типы), но строковые HTTP-маршруты, `$api`/`useAPI` в рантайме, сериализацию DTO, dynamic imports и часть Nuxt auto-imports формально связать не может. Правильный критерий: **«Serena находит все статически разрешимые связи и явно показывает точку, где начинается runtime/dynamic boundary; остаток подтверждается targeted reading и тестами»**. Отсутствие runtime-связи — **не** провал (этого ограничения нет ни у одного чистого LSP-решения).
>
> **Тест 11 — про baseline.** Используем `pnpm typecheck` (а не bare `vue-tsc --project tsconfig.json`: Nuxt требует сгенерированный `.nuxt/tsconfig.json`). Сравниваем **exit code** с зафиксированным baseline; уже существующие/известные предупреждения Volar или типов, присутствовавшие до Serena, **не** считаются регрессией.

---

## 10. Измерение эффекта

Цель — воспроизводимое сравнение, а не «на глаз». Токены как метрика ненадёжны (клиенты считают по-разному, «input tokens» включают системный prompt и MCP-схему и не изолируют reasoning; мешают retries и compaction), поэтому **главными делаем измеримые прокси**, а токены оставляем вторичной метрикой.

### 10.1. Фиксированные условия прогона

- **Фиксированные prompts** — по одному заранее записанному промпту на каждый сценарий (хранить рядом, напр. в `.docs/serena-benchmark/`), одинаковые для baseline и для Serena.
- **Фиксированное окружение**: одна и та же модель, reasoning level и permission mode во всех прогонах.
- **Чистая новая сессия** на каждый прогон (`/clear` или новый чат); никакого переиспользования контекста между задачами.
- **3+ прогона** на сценарий, берём медиану.
- Baseline снимается **до** включения hooks/override.

### 10.2. Сценарии (5)

- найти все использования Pinia store;
- найти реализацию composable;
- проследить DTO от формы до handler;
- оценить влияние изменения Zod-схемы;
- найти references символа между `.vue` и `.ts`.

### 10.3. Метрики (первичные — прокси)

- число **полных чтений файлов** (и отдельно — полных чтений `.vue`);
- **объём возвращённого инструментами текста** (реально прочитанные байты/строки);
- число **tool calls**;
- **время** до правильного ответа;
- **точность** найденных references (сверка с ручным эталоном);
- exit code `pnpm typecheck` (для сценариев с правкой).

Вторичная метрика — входные/выходные токены, **когда клиент их показывает**: Claude Code — `/cost` и итоговый отчёт сессии (опц. `CLAUDE_CODE_ENABLE_TELEMETRY`); Codex — встроенный счётчик сессии. Фиксировать также retries/compaction, если были.

### 10.4. Лог-таблица

Каждый прогон — строка: сценарий · режим (baseline/Serena) · session ID/URL · дата-время · модель/reasoning/permission · tool calls · полных чтений файлов · прочитанные байты · время · точность · токены (если есть) · заметки (retries/compaction).

### 10.5. Критерий сохранения Serena

Медианное снижение **полных чтений файлов / объёма прочитанного** ≥ 25% без ухудшения точности references и без регрессии `pnpm typecheck`. Если Claude/Codex нестабильно вызывает Serena — сначала чинить context/hooks/override, а не подключать второй graph-MCP.

---

## 11. Риски и меры

| Риск | Мера |
|---|---|
| Claude Code игнорирует MCP | Проверить context/`initial_instructions`, аккуратно включить `remind` hook, при необходимости — system prompt override в персональном workflow |
| Лишние MCP раздувают контекст | Держать Serena единственным code-MCP; отключать неиспользуемые серверы |
| Автоправка символов | Этап 1 — `read_only: true`; `auto-approve` выключен; rename — только preview + typecheck |
| Nuxt auto-import не резолвится | `pnpm exec nuxt prepare`, проверить `.nuxt/`, задокументировать ограничение |
| `.ts` перехватывается vue-сервером | Поменять порядок `languages` на `["typescript","vue"]` |
| Обновление Serena ломает Vue | Обновлять вручную после прохождения acceptance suite |
| Supply-chain LSP-зависимостей | Проверить версии/registry/сетевую политику, локальный каталог Serena |
| Память / orphan-процессы | Smoke-тест Claude/Codex, явный stop/restart при проблемах |
| Перезапись `.claude/settings.json` | Домержить `hooks`, сохранив существующий `permissions` |

---

## 12. Практические рекомендации

- Не ставить Serena из сторонних marketplace — только официальный `uv`-пакет.
- Не подключать несколько overlapping code-MCP.
- Project-scoped конфигурация для одного крупного репозитория.
- Начинать с минимального набора tools, `read_only: true`, без destructive auto-approval.
- Проверять, что агент **реально вызывает** Serena: «сервер connected» ≠ «модель его использует».
- Субъективные отзывы — не доказательство экономии токенов (часть пользователей отмечает эффект, часть — замедление). Нужен A/B-тест на Glasno (раздел 10). Примеры практического опыта (вторичные источники): [позитивный опыт](https://www.reddit.com/r/ClaudeAI/comments/1mp6di0/mcps_that_are_part_of_my_daytoday_claude_code/), [проблемы tool selection](https://www.reddit.com/r/ClaudeAI/comments/1phnpwd/claude_code_is_always_using_explorer_instead_of/).

---

## 13. Откат (uninstall)

Симметрично установке. Порядок безопасного полного удаления Serena:

1. **Claude Code — MCP:**
   ```bash
   claude mcp remove serena
   ```
2. **Claude Code — hooks:** убрать добавленный блок `hooks` из `.claude/settings.json`, **сохранив** существующий `permissions` (не удалять файл целиком).
3. **Codex:** удалить блок `[mcp_servers.serena]` из `~/.codex/config.toml`.
4. **Артефакты проекта:** удалить каталог `.serena/` из репозитория; откатить добавленные записи в корневом `.gitignore` (`.serena/cache/`, `.serena/project.local.yml`).
5. **Пакет (опционально):**
   ```bash
   uv tool uninstall serena-agent
   ```
6. **Проверка отката:**
   - в Claude Code `/mcp` больше не показывает Serena;
   - старт Codex не поднимает процесс Serena, orphan-процессов нет;
   - `pnpm typecheck` и `pnpm lint` зелёные (прикладной код не затронут);
   - `git status` не содержит остатков `.serena/`.

---

## Приложение А. Что исправлено против исходного ТЗ

| # | Было в исходном ТЗ | Исправление | Обоснование / источник |
|---|---|---|---|
| 1 | `language: vue`, «не включать typescript» | `languages: ["vue", "typescript"]` | Поле называется `languages` (список); standalone `.ts` (`server/`, `shared/`) индексирует только TS-сервер. [Шаблон project.yml](https://github.com/oraios/serena/blob/main/src/serena/resources/project.template.yml) |
| 2 | Исключения списком верхнего уровня | Поле `ignored_paths` + опора на `ignore_all_files_in_gitignore: true` | Точные имена полей из шаблона; часть путей уже в `.gitignore` |
| 3 | Только «не включать auto-approve» | Явный `read_only: true` на этапе 1 | Полностью отключает editing-инструменты — сильнее для «только анализ» |
| 4 | Hooks описаны абстрактно | Точный блок `.claude/settings.json` с `serena-hooks … --client=claude-code`; предупреждение о мёрже с `permissions` | [Подключение клиентов](https://oraios.github.io/serena/02-usage/030_clients.html); в проекте уже есть settings.json |
| 5 | Override упомянут обобщённо | Точная команда `serena prompts print-cc-system-prompt-override` | Официальная команда |
| 6 | Codex — только ручной TOML | Добавлен `serena setup codex`, путь `~/.codex/config.toml` | Официальный быстрый путь |
| 7 | `uv` считался доступным | Добавлен шаг установки `uv` | На целевой машине `uv` отсутствует |
| 8 | Тест типов `vue-tsc --project tsconfig.json` | `pnpm typecheck` (`nuxt typecheck`) | Nuxt требует `.nuxt/tsconfig.json`; проектная команда настроена |
| 9 | `project.yml` пишется руками | `serena project create` генерирует, затем правка | [Workflow](https://oraios.github.io/serena/02-usage/040_workflow.html) |
| 10 | — | Добавлены `.gitignore`-записи и заметка про монорепо `apps/landing` | Особенности репозитория |

### Вторая итерация правок (по замечаниям ревью)

| # | Что уточнено/исправлено | Обоснование / источник |
|---|---|---|
| 11 | Codex разделён на **CLI** (`--project-from-cwd` работает) и **App** (нужна явная «Activate the current dir as project…»); добавлен acceptance-тест 0 | Дословно в [clients](https://oraios.github.io/serena/02-usage/030_clients.html) |
| 12 | «Отдельные индексы не создаются» → каждый клиент запускает **свой процесс Serena/LSP**, общий лишь `project.yml`+кэш | Модель работы MCP: по процессу на клиента |
| 13 | Добавлен раздел 4.2 «Приватность и сеть» | Проверено по репо/докам |
| 13a | **Отклонено:** переменная `SERENA_USAGE_REPORTING=false` и «телеметрия по умолчанию» | Переменной нет в кодовой базе (grep пусто); внешней телеметрии не найдено; dashboard локальный. Предупреждение о `token_count_estimator: ANTHROPIC_CLAUDE_SONNET_4` — оставлено (оно реально ходит в API) |
| 14 | Стратегия версий: пиннинг `serena-agent==<version>`, апгрейд в отдельной ветке + повтор acceptance | Воспроизводимость |
| 15 | `activation_command` явно запрещён на этапе 1 | `nuxt prepare` на каждой активации замедляет сессии |
| 16 | Тесты 5/6 переформулированы под границы LSP (runtime/dynamic boundary ≠ провал); тест 11 — сравнение exit code, Volar-warning ≠ регрессия | Ограничение любого чистого LSP |
| 17 | Раздел 10 переписан: фикс-протокол, прокси-метрики первичны, токены вторичны, лог-таблица | Невоспроизводимость «input tokens» |
| 18 | Добавлен раздел 13 «Откат» | Симметрия установке |
| 19 | Отмечено, что `.serena/.gitignore` авто-создаётся (`project.py`); корневые записи — намеренная политика | `src/serena/project.py` |
| 20 | Уточнено «без изменений» = без изменений **прикладного** кода; служебные файлы Serena всё равно создаются | Прозрачность |

## Приложение Б. Зафиксированные версии (заполнить при установке)

```
Дата установки:        ____
serena --version:       ____
Python:                 3.13
Node.js:                v22.17.0
npm:                    ____
Nuxt:                   ^4.1.2
Vue:                    ^3.5.21
TypeScript:             ^5.6.3
vue-tsc:                ^2.1.10
@vue/language-server:   ____ (скачивается Serena)
```

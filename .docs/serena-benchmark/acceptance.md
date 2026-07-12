# Serena — результаты acceptance (раздел 9 ТЗ)

Клиент: **Claude Code** (MCP через `.mcp.json`, context `claude-code`).
Дата прогона: 2026-07-12. Serena 1.5.3, `read_only: true`.

## Baseline типов (тест 11)

- Команда: `pnpm typecheck` (`nuxt typecheck`).
- **Exit code: 0.**
- Известный Volar-warning `[Vue] Load plugin failed: vue-router/volar/sfc-route-blocks` присутствовал **до** Serena и по критерию теста 11 регрессией не считается. Сравниваем именно exit code.

## Проверенные тесты

| № | Проверка | Файл(ы) | Результат |
|---|---|---|---|
| 1 | Symbols в `<script setup>` `.vue` | `app/pages/interview/[id].vue` | ✅ Volar распарсил все функции/переменные с точными строками |
| 2 | Pinia definition + references | `app/stores/auth.ts` (`useAuthStore`) | ✅ references cross-file: `.vue`, composable, middleware |
| 4 | Composable usage ↔ definition | `useAuthStore` из `useInterviewExplainSelectionOnboarding.ts` | ✅ usage из `.ts`/`.vue` разрешается |
| 5 | API-слой (статическая цепочка) | `InterviewStateResponse`: DTO → `interviewService` → `.vue` (`api<…>()`) | ✅ тип прослежен статически; строковые маршруты `/api/interview/...` явно остаются runtime-границей |
| 6 | Zod DTO references | `shared/dto/interview.ts` (`InterviewStateResponse`) | ✅ imports/типы разрешаются во всех потребителях |
| 11 | Регрессия типов | `pnpm typecheck` | ✅ exit 0 (baseline) |

## Не прогонялись (открыто)

- Тесты 0 (Codex App активация), 3 (template binding отдельно), 7 (rename preview — этап 2), 8 (alias/auto-import отдельным кейсом), 9/10/12 — требуют прогонов в Codex и A/B-замеров.
- Полноценный A/B (раздел 10, `results.csv`) — baseline **без** Serena против Serena — отдельная работа: нужны чистые сессии и медиана 3+ прогонов на сценарий.

**Вывод:** ключевые статические возможности Serena на Glasho подтверждены в Claude Code — Volar корректно индексирует `.vue`, cross-file references по Pinia/DTO/composables работают, границы LSP видны явно. Регрессии типов нет.

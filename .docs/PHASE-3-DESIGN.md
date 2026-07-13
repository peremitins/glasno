# Фаза 3 — дизайн реализации

## Цель

После завершения текстовой interview session пользователь получает сохранённый отчёт: общий балл, критерии, разбор по вопросам, Главные правки, пример сильного ответа по STAR и PDF-экспорт.

## Границы фазы

Входит:

- LLM-разбор завершённой сессии;
- сохранение результата в `interview_reports`;
- BullMQ-слой постановки задачи с sync fallback для локального dev;
- веб-экран отчёта;
- PDF endpoint.

Не входит:

- полноценные paid limits;
- email/Telegram delivery;
- сложный дизайн отчёта фазы 6;
- видео/голосовая аналитика.

## Архитектура

- `shared/dto/report.ts` — DTO отчёта и API-контракты.
- `server/application/reports/reportService.ts` — сценарии: получить/создать/сгенерировать отчёт.
- `server/interface/reportEngine.ts` — LLM-порт анализа.
- `server/interface/reportRepository.ts` — порт хранения отчётов.
- `server/infrastructure/llm/openaiReportEngine.ts` — OpenAI Responses JSON-анализ.
- `server/infrastructure/reports/drizzleReportRepository.ts` — Drizzle-хранение.
- `server/application/reports/reportQueue.ts` — BullMQ enqueue + безопасный sync fallback.
- `server/api/interview/sessions/[id]/report.*` и `server/api/interview/reports/[id].get.ts`.

## Поведение

1. На завершённой сессии фронт вызывает `POST /api/interview/sessions/:id/report`.
2. Если отчёт уже есть, API возвращает его.
3. Если отчёта нет:
   - создаётся строка `interview_reports` со статусом `queued`;
   - задача ставится в BullMQ, если Redis доступен и workers включены;
   - в dev fallback отчёт генерируется синхронно, чтобы MVP работал без отдельного worker-процесса.
4. `GET /api/interview/sessions/:id/report` и `GET /api/interview/reports/:id` возвращают текущий статус.
5. `GET /api/interview/reports/:id/pdf` отдаёт PDF.

## Формат отчёта

Критерии:

- `structure`;
- `specificity`;
- `relevance`;
- `confidence`;
- `riskPhrases`;
- `brevity`.

В отчёте также сохраняются:

- общий балл `0..100`;
- краткий verdict;
- `topFixes` — Главные правки;
- `questionAnalysis[]` — что хорошо, что слабо, сильный STAR-ответ, мини-тренировка.

## Проверки

- unit-тест report service: не генерирует отчёт по незавершённой сессии;
- unit-тест report service: сохраняет LLM-анализ по завершённой сессии;
- unit-тест parser helper для OpenAI Responses JSON;
- `pnpm test:run`, `pnpm typecheck`, `pnpm build`.

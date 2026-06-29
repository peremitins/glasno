# Фаза 3 — implementation plan

## Шаги

1. Добавить зависимости для визуализации и PDF:
   - `apexcharts`;
   - `vue3-apexcharts`;
   - `pdfkit`;
   - `@types/pdfkit`.

2. Добавить DTO отчёта:
   - `shared/dto/report.ts`;
   - экспорт из `shared/dto/index.ts`.

3. Расширить БД:
   - `server/infrastructure/db/schema.ts`;
   - новая миграция через `pnpm db:generate`;
   - поля `status`, `verdict`, `summary`, `question_analysis`, `error_message`, `model`, `updated_at`.

4. Написать failing tests:
   - `server/application/reports/reportService.test.ts`;
   - `server/infrastructure/llm/openaiReportEngine.test.ts`.

5. Реализовать application и инфраструктуру:
   - `server/interface/reportEngine.ts`;
   - `server/interface/reportRepository.ts`;
   - `server/application/reports/reportService.ts`;
   - `server/application/reports/reportQueue.ts`;
   - `server/infrastructure/reports/drizzleReportRepository.ts`;
   - `server/infrastructure/llm/openaiReportEngine.ts`;
   - `server/infrastructure/pdf/reportPdf.ts`.

6. Добавить API:
   - `POST /api/interview/sessions/:id/report`;
   - `GET /api/interview/sessions/:id/report`;
   - `GET /api/interview/reports/:id`;
   - `GET /api/interview/reports/:id/pdf`.

7. Добавить веб:
   - `app/plugins/apexcharts.client.ts`;
   - `app/pages/interview/report/[id].vue`;
   - CTA из завершённой сессии на генерацию отчёта;
   - i18n-строки.

8. Проверить:
   - `pnpm db:generate`;
   - `pnpm db:migrate`;
   - `pnpm test:run`;
   - `pnpm typecheck`;
   - `pnpm build`.

# Фаза 2 — implementation plan

## Цель

Реализовать вертикальный текстовый MVP интервью end-to-end: источник вакансии → первый вопрос → ответы и уточнения → сохранённая завершённая сессия.

## Задачи

1. Добавить тестовую инфраструктуру:
   - `vitest`;
   - `test` и `test:run` scripts;
   - unit-тесты для source parsing и interview service.

2. Расширить DTO:
   - `shared/dto/interview.ts`;
   - экспорт из `shared/dto/index.ts`;
   - enum-значения источника, уровня, режима, статуса и kind реплики.

3. Расширить БД:
   - `server/infrastructure/db/schema.ts`;
   - Drizzle migration через `pnpm db:generate`;
   - `user_id` сделать nullable;
   - добавить anonymous/session/source/resume/turn metadata поля.

4. Добавить порты и application-сервисы:
   - `server/interface/hh.ts`;
   - `server/interface/llm.ts`;
   - `server/interface/interviewRepository.ts`;
   - `server/application/interview/source.ts`;
   - `server/application/interview/interviewService.ts`.

5. Добавить инфраструктурные реализации:
   - `server/infrastructure/hh/hhClient.ts`;
   - `server/infrastructure/llm/openaiInterviewEngine.ts`;
   - `server/infrastructure/interview/drizzleInterviewRepository.ts`;
   - `server/infrastructure/resume/extractResumeText.ts`.

6. Добавить API:
   - `server/api/interview/sessions.post.ts`;
   - `server/api/interview/sessions/[id].get.ts`;
   - `server/api/interview/sessions/[id]/answer.post.ts`;
   - `server/api/interview/resume/extract.post.ts`.

7. Добавить веб-flow:
   - обновить `app/pages/interview/new.vue`;
   - создать `app/pages/interview/[id].vue`;
   - расширить `app/i18n/locales/ru.json`.

8. Проверить:
   - `pnpm test:run`;
   - `pnpm db:generate`;
   - `pnpm exec tsc --noEmit`;
   - `pnpm build` или, если сборка упрётся во внешнее окружение, зафиксировать точную причину.

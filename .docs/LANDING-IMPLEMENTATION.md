# Лендинг Гласно — реализация

Статус: в работе. Цель — заменить заглушку в `apps/landing` на полноценный статический лендинг `glasno.app` с UI-демо голосового интервью, подсказок, отчёта, тарифов, SEO и юридическими документами.

## Чеклист

- [x] Этап 1: создать `.docs/LANDING-IMPLEMENTATION.md` с чеклистом.
- [x] Этап 2: обновить landing infrastructure: Tailwind plugin, SEO head, robots, sitemap, legal files.
- [x] Этап 3: собрать дизайн-систему лендинга: tokens, layout helpers, CTA, demo shell, waveform, report preview.
- [x] Этап 4: сверстать hero и ключевой scrolltelling: voice demo, hints demo, report demo.
- [x] Этап 5: добавить pricing/trust/FAQ/final CTA, синхронизировать цены с `server/application/billing/plans.ts`.
- [x] Этап 6: подключить GSAP-анимации, reduced-motion fallback и mobile-safe behavior.
- [x] Этап 7: проверить legal links, SEO, адаптивность, build/generate и визуально через локальный `pnpm landing:dev`.

## Принятые решения

- Первый релиз использует UI-демо вместо реальных видеофайлов.
- Визуальный стиль — тёмный серьёзный cockpit, без фиолетового AI-клише и декоративного перегруза.
- Юридические документы адаптируются из формата Mentala под «Гласно», домены `glasno.app` / `my.glasno.app` и контакт `peremitinns@gmail.com`.
- Существующие dirty-изменения вне лендинга не входят в задачу и не трогаются.

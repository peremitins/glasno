import {
  closeRenewalQueue,
  createRenewalWorker,
  ensureRenewalSchedule,
  RENEWAL_SWEEP_INTERVAL_MS,
  resolveRenewalRedisUrl,
} from '@/server/application/billing/renewalQueue';
import { createBillingServiceFromConfig } from '@/server/application/billing/serviceFactory';

// Фоновое автопродление подписок. Без него списания срабатывали бы только
// при заходе пользователя на /api/billing/status — «уснувший» подписчик
// не продлевался бы вовремя.
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) return;
  // Kill-switch на случай инцидента с автосписаниями.
  if (process.env.BILLING_RENEWAL_DISABLED === 'true') return;

  const config = useRuntimeConfig();
  const createService = () => createBillingServiceFromConfig(config);
  const redisUrl = resolveRenewalRedisUrl(
    typeof config.redisUrl === 'string' ? config.redisUrl : null
  );

  if (redisUrl) {
    // BullMQ: расписание раз в час + воркер. Несколько реплик безопасны —
    // job scheduler идемпотентен, доставка джоба единичная, а claim-паттерн
    // в BillingService исключает двойное списание.
    const worker = createRenewalWorker({ redisUrl, createService });
    worker.on('failed', (_job, err) => {
      console.error('[billing] renewal sweep job failed', err);
    });
    void ensureRenewalSchedule(redisUrl).catch((err) => {
      console.error('[billing] failed to schedule renewal sweep', err);
    });
    nitroApp.hooks.hook('close', async () => {
      await worker.close();
      await closeRenewalQueue();
    });
    return;
  }

  // Без Redis (локальная разработка/деградация): обычный интервал в процессе.
  // Claim-паттерн делает параллельные прогоны безопасными и здесь.
  const runSweep = () => {
    void createService()
      .runAutoRenewalSweep()
      .catch((err) => {
        console.error('[billing] renewal sweep failed', err);
      });
  };
  // Первый прогон вскоре после старта — подобрать просроченные за деплой.
  const initialTimer = setTimeout(runSweep, 60 * 1000);
  const timer = setInterval(runSweep, RENEWAL_SWEEP_INTERVAL_MS);
  nitroApp.hooks.hook('close', () => {
    clearTimeout(initialTimer);
    clearInterval(timer);
  });
});

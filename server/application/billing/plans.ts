import type { BillingPlan } from '@/shared/dto';
import { apiError } from '@/server/utils/errors';

export interface BillingPlanConfig extends BillingPlan {
  periodDays: number;
}

export const FREE_SESSIONS_LIMIT = 1;

export const BILLING_PLANS: BillingPlanConfig[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Одна полноценная тренировка, чтобы проверить формат.',
    priceRub: 0,
    currency: 'RUB',
    interval: 'once',
    kind: 'subscription',
    realtimeVoiceMinutes: 0,
    features: [
      '1 интервью по вакансии или профессии',
      'Текстовый режим и диктовка',
      'Базовый отчёт после завершения',
    ],
    badge: null,
    isHighlighted: false,
    isCheckoutEnabled: false,
    periodDays: 0,
  },
  {
    id: 'pro_monthly',
    name: 'Pro',
    description: 'Регулярная подготовка к активному поиску работы.',
    priceRub: 990,
    currency: 'RUB',
    interval: 'month',
    kind: 'subscription',
    realtimeVoiceMinutes: 60,
    features: [
      'Безлимитные интервью в течение месяца',
      '60 минут realtime voice в месяц',
      'PDF-отчёты и история прогресса',
    ],
    badge: 'Оптимально',
    isHighlighted: true,
    isCheckoutEnabled: true,
    periodDays: 30,
  },
  {
    id: 'career_pack',
    name: 'Career Pack',
    description: 'Интенсив перед серией собеседований.',
    priceRub: 1990,
    currency: 'RUB',
    interval: 'month',
    kind: 'subscription',
    realtimeVoiceMinutes: 100,
    features: [
      'Всё из Pro',
      '100 минут realtime voice в месяц',
      'Стресс-вопросы и senior-сценарии',
      'Расширенная база вопросов для подготовки',
    ],
    badge: 'Интенсив',
    isHighlighted: false,
    isCheckoutEnabled: true,
    periodDays: 30,
  },
  {
    id: 'realtime_voice_60',
    name: 'Realtime +60',
    description: 'Дополнительные минуты голосового режима для активной подготовки.',
    priceRub: 590,
    currency: 'RUB',
    interval: 'once',
    kind: 'addon',
    realtimeVoiceMinutes: 60,
    features: [
      '+60 минут realtime voice',
      'Действуют вместе с активным тарифом',
      'Подходят для длинных тренировок перед важным интервью',
    ],
    badge: 'Доп. минуты',
    isHighlighted: false,
    isCheckoutEnabled: true,
    periodDays: 30,
  },
];

export function getPublicBillingPlans(): BillingPlan[] {
  return BILLING_PLANS.map(({ periodDays: _periodDays, ...plan }) => plan);
}

export function getBillingPlan(planId: string): BillingPlanConfig {
  const plan = BILLING_PLANS.find((item) => item.id === planId);
  if (!plan) {
    throw apiError('E_NOT_FOUND', 'Тариф не найден');
  }
  return plan;
}

export function getPaidBillingPlan(planId: string): BillingPlanConfig {
  const plan = getBillingPlan(planId);
  if (!plan.isCheckoutEnabled || plan.priceRub <= 0) {
    throw apiError('E_VALIDATION', 'Для этого тарифа оплата не требуется');
  }
  return plan;
}

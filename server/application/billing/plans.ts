import type { BillingPlan } from '@/shared/dto';
import { apiError } from '@/server/utils/errors';

export type SessionGoalAccess = 'quick' | 'standard' | 'deep';

export interface BillingPlanConfig extends BillingPlan {
  // Автопродление применимо только к пропускам «Полный доступ».
  autoRenewable: boolean;
}

// Бесплатный трайл: одно быстрое интервью до оплаты. Это не тариф и не
// карточка — состояние онбординга, отображается в блоке «Текущий доступ».
export const FREE_SESSIONS_LIMIT = 1;
export const FREE_ALLOWED_SESSION_GOALS: SessionGoalAccess[] = ['quick'];

// Бесплатный трайл получает минуты живого голоса (Realtime Voice), чтобы
// попробовать главную фичу ещё до оплаты — это ключевой драйвер конверсии.
// Себестоимость gpt-realtime ≈ 9–12 ₽/мин, поэтому трайл намеренно небольшой:
// 5 минут ≈ 45–60 ₽ на юзера. Выдаётся один раз на пользователя как обычный
// грант минут (sourceType='trial'), поэтому весь учёт/списание/анти-гонка
// работают той же логикой, что и покупки.
export const FREE_TRIAL_VOICE_MINUTES = 5;
// Срок жизни триал-гранта. Расход ограничен минутами, а не сроком; TTL нужен
// лишь чтобы грант не «протух» до первого интервью — берём длинный запас.
export const FREE_TRIAL_VOICE_TTL_DAYS = 365;
export const TRIAL_VOICE_GRANT_PLAN_ID = 'trial';
export const ALL_SESSION_GOALS: SessionGoalAccess[] = [
  'quick',
  'standard',
  'deep',
];

// Антиабьюз для «безлимитных» интервью (ТЗ тарифы v2, раздел 2): в UI лимитов
// нет, внутренне — защита от автоматизации. Burst-окно, а не интервал между
// сессиями: «создал не то — тут же пересоздал» должно работать.
export const SESSION_CREATION_BURST_LIMIT = 3;
export const SESSION_CREATION_BURST_WINDOW_MS = 10 * 60 * 1000;
export const SESSION_CREATION_DAILY_LIMIT = 20;

const PASS_HIGHLIGHTED_ID = 'pass_30d';

// В UI фичи одинаковы для всех сроков, кроме количества минут голоса.
function passFeatures(voiceMinutes: number): string[] {
  return [
    'Все форматы интервью без ограничений',
    `${voiceMinutes} минут живого голосового интервью`,
    'Подробный разбор и PDF-отчёт',
    'Докупка минут голоса',
  ];
}

function passPlan(params: {
  id: string;
  durationDays: number;
  priceRub: number;
  realtimeVoiceMinutes: number;
  badge?: string | null;
}): BillingPlanConfig {
  return {
    id: params.id,
    name: `Полный доступ · ${params.durationDays} дн.`,
    description:
      'Все форматы интервью без ограничений, разбор и PDF-отчёт на весь срок.',
    priceRub: params.priceRub,
    currency: 'RUB',
    type: 'pass',
    durationDays: params.durationDays,
    realtimeVoiceMinutes: params.realtimeVoiceMinutes,
    features: passFeatures(params.realtimeVoiceMinutes),
    badge: params.badge ?? null,
    isHighlighted: params.id === PASS_HIGHLIGHTED_ID,
    isCheckoutEnabled: true,
    autoRenewable: true,
  };
}

function minutePackPlan(params: {
  id: string;
  name: string;
  description: string;
  priceRub: number;
  realtimeVoiceMinutes: number;
  badge?: string | null;
}): BillingPlanConfig {
  return {
    id: params.id,
    name: params.name,
    description: params.description,
    priceRub: params.priceRub,
    currency: 'RUB',
    type: 'minute_pack',
    // Минуты доступны и в трайле, поэтому пакет действует свой срок.
    durationDays: 30,
    realtimeVoiceMinutes: params.realtimeVoiceMinutes,
    features: [
      `+${params.realtimeVoiceMinutes} минут голосового интервью`,
      'Действуют 30 дней с момента оплаты',
      'Разовая покупка без автопродления',
    ],
    badge: params.badge ?? null,
    isHighlighted: false,
    isCheckoutEnabled: true,
    autoRenewable: false,
  };
}

// Сетка утверждена в .docs/ТЗ-тарифы-v2-пропуска.md (ревизия 2).
// Экономика: голос gpt-realtime ≈ 9–12 ₽/мин блендед; пол цены задаёт
// worst-case сжигание минут. 7 дней получают 30 минут — недельные
// покупатели сжигают минуты интенсивнее всех. Пересмотр цен — по
// фактической телеметрии себестоимости после первых ~50–100 платежей.
export const BILLING_PLANS: BillingPlanConfig[] = [
  passPlan({
    id: 'pass_7d',
    durationDays: 7,
    priceRub: 449,
    realtimeVoiceMinutes: 30,
    badge: 'Собес на носу',
  }),
  passPlan({
    id: 'pass_15d',
    durationDays: 15,
    priceRub: 899,
    realtimeVoiceMinutes: 60,
  }),
  passPlan({
    id: 'pass_30d',
    durationDays: 30,
    priceRub: 1190,
    realtimeVoiceMinutes: 60,
    badge: 'Оптимально',
  }),
  passPlan({
    id: 'pass_90d',
    durationDays: 90,
    priceRub: 2290,
    realtimeVoiceMinutes: 60,
  }),
  passPlan({
    id: 'pass_180d',
    durationDays: 180,
    priceRub: 3490,
    realtimeVoiceMinutes: 60,
  }),
  passPlan({
    id: 'pass_365d',
    durationDays: 365,
    priceRub: 4990,
    realtimeVoiceMinutes: 60,
    badge: 'Выгодно',
  }),
  minutePackPlan({
    id: 'realtime_pack_30',
    name: '+30 минут голоса',
    description: 'Небольшой запас перед важным интервью.',
    priceRub: 490,
    realtimeVoiceMinutes: 30,
  }),
  minutePackPlan({
    id: 'realtime_pack_60',
    name: '+60 минут голоса',
    description: 'Стандартный пакет для активной подготовки.',
    priceRub: 890,
    realtimeVoiceMinutes: 60,
    badge: 'Популярный',
  }),
  minutePackPlan({
    id: 'realtime_pack_120',
    name: '+120 минут голоса',
    description: 'Для интенсивной серии голосовых тренировок.',
    priceRub: 1590,
    realtimeVoiceMinutes: 120,
  }),
];

export function getPublicBillingPlans(): BillingPlan[] {
  return BILLING_PLANS.map(toPublicPlan);
}

export function getPassPlans(): BillingPlanConfig[] {
  return BILLING_PLANS.filter((plan) => plan.type === 'pass');
}

function toPublicPlan(plan: BillingPlanConfig): BillingPlan {
  const {
    autoRenewable: _autoRenewable,
    ...publicPlan
  } = plan;
  return publicPlan;
}

export function getBillingPlan(planId: string): BillingPlanConfig {
  const plan = findBillingPlan(planId);
  if (!plan) {
    throw apiError('E_NOT_FOUND', 'Тариф не найден');
  }
  return plan;
}

export function findBillingPlan(planId: string): BillingPlanConfig | null {
  return BILLING_PLANS.find((item) => item.id === planId) ?? null;
}

export function getPaidBillingPlan(planId: string): BillingPlanConfig {
  const plan = getBillingPlan(planId);
  if (!plan.isCheckoutEnabled || plan.priceRub <= 0) {
    throw apiError('E_VALIDATION', 'Для этого тарифа оплата не требуется');
  }
  return plan;
}

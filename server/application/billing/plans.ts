import type { BillingPlan } from '@/shared/dto';
import { apiError } from '@/server/utils/errors';

export type SessionGoalAccess = 'quick' | 'standard' | 'deep';

export interface BillingPlanConfig extends BillingPlan {
  periodDays: number;
  // Сколько интервью включено (null = без ограничений). Для one_time тарифов.
  includedInterviews: number | null;
  // Какие форматы интервью открывает тариф.
  allowedSessionGoals: SessionGoalAccess[];
  // Требуется ли активный платный тариф для покупки (пакеты минут).
  requiresActiveSubscription: boolean;
  // Показывать ли тариф в публичном списке (legacy-тарифы скрываем,
  // но продолжаем корректно обслуживать уже выданные гранты).
  isPublic: boolean;
  // Приоритет при определении «основного» активного тарифа пользователя.
  priority: number;
}

export const FREE_SESSIONS_LIMIT = 1;
export const FREE_ALLOWED_SESSION_GOALS: SessionGoalAccess[] = ['quick'];
export const ALL_SESSION_GOALS: SessionGoalAccess[] = [
  'quick',
  'standard',
  'deep',
];

export const BILLING_PLANS: BillingPlanConfig[] = [
  {
    id: 'free',
    name: 'Бесплатно',
    // ВАЖНО: описания и features тарифов вручную синхронизированы с лендингом
    // (apps/landing/composables/useLandingContent.ts). Меняешь здесь — поправь там.
    description: 'Попробуйте формат без оплаты.',
    priceRub: 0,
    currency: 'RUB',
    interval: 'once',
    kind: 'subscription',
    realtimeVoiceMinutes: 0,
    features: [
      '1 быстрое интервью на 5–7 минут',
      'Ответы голосом или текстом',
      'Разбор с оценкой и рекомендациями',
    ],
    badge: null,
    isHighlighted: false,
    isCheckoutEnabled: false,
    periodDays: 0,
    includedInterviews: FREE_SESSIONS_LIMIT,
    allowedSessionGoals: FREE_ALLOWED_SESSION_GOALS,
    requiresActiveSubscription: false,
    isPublic: true,
    priority: 0,
  },
  {
    id: 'single_prep',
    name: 'Разовая подготовка',
    description: 'Одна серьёзная репетиция перед конкретным интервью.',
    priceRub: 399,
    currency: 'RUB',
    interval: 'once',
    kind: 'one_time',
    // 30 минут покрывают quick/standard и почти весь deep-сценарий. По текущему
    // прайсу OpenAI realtime это оставляет запас маржи в тарифе 399₽ даже при
    // полном использовании лимита, но требует мониторинга фактических audio tokens.
    realtimeVoiceMinutes: 30,
    features: [
      '1 интервью любой длины и глубины',
      '30 минут живого голосового интервью',
      'Подробный разбор и PDF-отчёт',
      'Докупка минут',
    ],
    badge: 'Собес на носу',
    isHighlighted: false,
    isCheckoutEnabled: true,
    periodDays: 7,
    includedInterviews: 1,
    allowedSessionGoals: ALL_SESSION_GOALS,
    requiresActiveSubscription: false,
    isPublic: true,
    priority: 10,
  },
  {
    id: 'pro_monthly',
    name: 'Pro',
    description: 'Для активного поиска и регулярной практики.',
    priceRub: 990,
    currency: 'RUB',
    interval: 'month',
    kind: 'subscription',
    realtimeVoiceMinutes: 60,
    features: [
      'Интервью без ограничений',
      '60 минут живого голосового интервью',
      'История прогресса и разборы в PDF',
      'Докупка минут',
    ],
    badge: 'Оптимально',
    isHighlighted: true,
    isCheckoutEnabled: true,
    periodDays: 30,
    includedInterviews: null,
    allowedSessionGoals: ALL_SESSION_GOALS,
    requiresActiveSubscription: false,
    isPublic: true,
    priority: 20,
  },
  // LEGACY: Career Pack снят с продажи. Его дифференциатор (стресс-вопросы,
  // senior-сценарии) не реализован, а по минутам он невыгоднее Pro + пакета
  // (990+890 = 1880₽ за 120 мин против 1990₽ за 100 мин). Вернём, когда
  // появятся реальные премиум-фичи. Уже выданные гранты обслуживаются.
  {
    id: 'career_pack',
    name: 'Career Pack',
    description: 'Архивный тариф: Pro + 100 минут голосового интервью.',
    priceRub: 1990,
    currency: 'RUB',
    interval: 'month',
    kind: 'subscription',
    realtimeVoiceMinutes: 100,
    features: ['Всё из Pro', '100 минут живого голосового интервью с AI'],
    badge: null,
    isHighlighted: false,
    isCheckoutEnabled: false,
    periodDays: 30,
    includedInterviews: null,
    allowedSessionGoals: ALL_SESSION_GOALS,
    requiresActiveSubscription: false,
    isPublic: false,
    priority: 30,
  },
  // Пакеты минут realtime voice. Не тарифы, а расходники: показываются
  // отдельным блоком и требуют активный платный тариф (подписка или
  // разовый доступ); срок пакета не превышает срок самого доступа.
  {
    id: 'realtime_pack_30',
    name: '+30 минут голоса',
    description: 'Небольшой запас перед важным интервью.',
    priceRub: 490,
    currency: 'RUB',
    interval: 'once',
    kind: 'addon',
    realtimeVoiceMinutes: 30,
    features: [
      '+30 минут голосового интервью',
      'Не сгорают, пока активен платный тариф',
      'Нужен активный платный тариф',
    ],
    badge: null,
    isHighlighted: false,
    isCheckoutEnabled: true,
    periodDays: 30,
    includedInterviews: null,
    allowedSessionGoals: [],
    requiresActiveSubscription: true,
    isPublic: true,
    priority: 0,
  },
  {
    id: 'realtime_pack_60',
    name: '+60 минут голоса',
    description: 'Стандартный пакет для активной подготовки.',
    priceRub: 890,
    currency: 'RUB',
    interval: 'once',
    kind: 'addon',
    realtimeVoiceMinutes: 60,
    features: [
      '+60 минут живого голосового интервью',
      'Не сгорают, пока активен платный тариф',
      'Нужен активный платный тариф',
    ],
    badge: 'Популярный',
    isHighlighted: false,
    isCheckoutEnabled: true,
    periodDays: 30,
    includedInterviews: null,
    allowedSessionGoals: [],
    requiresActiveSubscription: true,
    isPublic: true,
    priority: 0,
  },
  {
    id: 'realtime_pack_120',
    name: '+120 минут голоса',
    description: 'Для интенсивной серии голосовых тренировок.',
    priceRub: 1590,
    currency: 'RUB',
    interval: 'once',
    kind: 'addon',
    realtimeVoiceMinutes: 120,
    features: [
      '+120 минут голосового интервью',
      'Не сгорают, пока активен платный тариф',
      'Нужен активный платный тариф',
    ],
    badge: 'Выгодно',
    isHighlighted: false,
    isCheckoutEnabled: true,
    periodDays: 30,
    includedInterviews: null,
    allowedSessionGoals: [],
    requiresActiveSubscription: true,
    isPublic: true,
    priority: 0,
  },
  // LEGACY: старый add-on «Realtime +60» за 590₽. Продажа выключена
  // (цена ниже себестоимости), но уже выданные гранты обслуживаем.
  {
    id: 'realtime_voice_60',
    name: 'Realtime +60',
    description: 'Дополнительные минуты голосового режима (архивный пакет).',
    priceRub: 590,
    currency: 'RUB',
    interval: 'once',
    kind: 'addon',
    realtimeVoiceMinutes: 60,
    features: ['+60 минут realtime voice'],
    badge: null,
    isHighlighted: false,
    isCheckoutEnabled: false,
    periodDays: 30,
    includedInterviews: null,
    allowedSessionGoals: [],
    requiresActiveSubscription: true,
    isPublic: false,
    priority: 0,
  },
];

export function getPublicBillingPlans(): BillingPlan[] {
  return BILLING_PLANS.filter((plan) => plan.isPublic).map(toPublicPlan);
}

function toPublicPlan(plan: BillingPlanConfig): BillingPlan {
  const {
    periodDays: _periodDays,
    includedInterviews: _includedInterviews,
    allowedSessionGoals: _allowedSessionGoals,
    requiresActiveSubscription: _requiresActiveSubscription,
    isPublic: _isPublic,
    priority: _priority,
    ...publicPlan
  } = plan;
  return publicPlan;
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

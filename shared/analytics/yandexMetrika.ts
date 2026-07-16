// Идентификаторы точно соответствуют шести целям, созданным в Метрике.
// Храним контракт отдельно от UI: лендинг и приложение не расходятся в именах.
export const YandexMetrikaGoal = {
  landingAppOpen: 'landing_app_open',
  authCompleted: 'auth_completed',
  checkoutCreated: 'checkout_created',
  passPaid: 'pass_paid',
  minutePackPaid: 'minute_pack_paid',
  interviewStarted: 'interview_started',
} as const;

export const YandexMetrikaMethod = {
  reachGoal: 'reachGoal',
} as const;

export type YandexMetrikaGoalId =
  (typeof YandexMetrikaGoal)[keyof typeof YandexMetrikaGoal];

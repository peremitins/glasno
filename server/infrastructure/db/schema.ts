import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  doublePrecision,
} from 'drizzle-orm/pg-core';

// МИНИМАЛЬНАЯ стартовая схема. Расширяем по мере реализации фич.
// Принцип Mentala: не удалять/не переименовывать поля без миграционного
// плана; новые поля добавлять, старые оставлять.

// Пользователь. Ключ привязки — telegram_id или email (passwordless).
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  telegramId: text('telegram_id').unique(),
  telegramUsername: text('telegram_username'),
  email: text('email').unique(),
  displayName: text('display_name'),
  role: text('role').default('user').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Полноценная auth-сессия. Cookie хранит id + opaque token + HMAC, в БД
// лежит только hash opaque token и hash CSRF token.
export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  tokenHash: text('token_hash').unique().notNull(),
  csrfTokenHash: text('csrf_token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// Одноразовые email-коды. Email хранится как HMAC(email, EMAIL_HASH_PEPPER).
export const emailLoginCodes = pgTable('email_login_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  emailHash: text('email_hash').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  attempts: integer('attempts').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Задел под Telegram-бота: одноразовый login token по telegram_id.
export const magicLoginTokens = pgTable('magic_login_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  telegramId: text('telegram_id').notNull(),
  tokenHash: text('token_hash').unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Сессия интервью.
export const interviewSessions = pgTable('interview_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id),
  anonymousSessionId: text('anonymous_session_id').notNull(),
  source: text('source').notNull(), // 'hh' | 'text' | 'profession'
  vacancyTitle: text('vacancy_title'),
  vacancyUrl: text('vacancy_url'),
  companyName: text('company_name'),
  vacancyRaw: text('vacancy_raw'), // текст/описание вакансии
  resumeRaw: text('resume_raw'),
  role: text('role'),
  level: text('level'), // junior | middle | senior
  format: integer('format'), // кол-во вопросов
  questionCount: integer('question_count').default(3).notNull(),
  language: text('language').default('ru').notNull(),
  interviewerMode: text('interviewer_mode'), // soft | neutral | strict
  interviewerAvatarId: text('interviewer_avatar_id').default('neutral-pro').notNull(),
  status: text('status').default('created').notNull(), // created | running | done
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Реплики/ответы внутри сессии.
export const interviewTurns = pgTable('interview_turns', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .references(() => interviewSessions.id)
    .notNull(),
  index: integer('index').notNull(),
  kind: text('kind').default('main').notNull(), // main | clarification
  question: text('question').notNull(),
  answerTranscript: text('answer_transcript'),
  followUpForTurnId: uuid('follow_up_for_turn_id'),
  answeredAt: timestamp('answered_at', { withTimezone: true }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Итоговый разбор сессии (оценки по критериям + рекомендации).
export const interviewReports = pgTable('interview_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .references(() => interviewSessions.id)
    .notNull(),
  status: text('status').default('queued').notNull(),
  overallScore: integer('overall_score'),
  verdict: text('verdict'),
  summary: text('summary'),
  criteria: jsonb('criteria'), // { structure, specificity, relevance, ... }
  recommendations: jsonb('recommendations'),
  questionAnalysis: jsonb('question_analysis'),
  errorMessage: text('error_message'),
  model: text('model'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// База вопросов (своя, генерируется LLM + вычитка).
export const questionBank = pgTable('question_bank', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug'),
  domain: text('domain').notNull(), // сфера
  role: text('role'),
  type: text('type').notNull(), // hr | behavioral | professional | stress
  difficulty: text('difficulty').default('middle').notNull(),
  question: text('question').notNull(),
  strongAnswer: text('strong_answer'),
  commonMistakes: text('common_mistakes'),
  isPublic: boolean('is_public').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Платёжные заказы YooKassa.
export const paymentOrders = pgTable('payment_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  planId: text('plan_id').notNull(),
  provider: text('provider').default('yookassa').notNull(),
  providerPaymentId: text('provider_payment_id'),
  status: text('status').default('pending').notNull(),
  amountRub: integer('amount_rub').notNull(),
  currency: text('currency').default('RUB').notNull(),
  confirmationUrl: text('confirmation_url'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Гранты доступа после успешной оплаты.
export const userSubscriptions = pgTable('user_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  planId: text('plan_id').notNull(),
  status: text('status').default('active').notNull(),
  provider: text('provider').default('yookassa').notNull(),
  providerPaymentId: text('provider_payment_id'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Детальный учёт использования AI. Одна запись = один вызов модели.
// Позволяет точно посчитать стоимость по пользователям/сессиям.
export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  anonymousSessionId: text('anonymous_session_id'),
  interviewSessionId: uuid('interview_session_id').references(
    () => interviewSessions.id
  ),
  // question_gen | answer_eval | report | tts | realtime | resume_extract
  kind: text('kind').notNull(),
  provider: text('provider').default('openai').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').default(0).notNull(),
  cachedInputTokens: integer('cached_input_tokens').default(0).notNull(),
  outputTokens: integer('output_tokens').default(0).notNull(),
  totalTokens: integer('total_tokens').default(0).notNull(),
  // Для аудио-моделей (TTS/Realtime): секунды и символы.
  audioSeconds: doublePrecision('audio_seconds').default(0).notNull(),
  characters: integer('characters').default(0).notNull(),
  costUsd: doublePrecision('cost_usd').default(0).notNull(),
  latencyMs: integer('latency_ms'),
  requestId: text('request_id'),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Серверный lifecycle realtime voice. Нужен для точного списания секунд и
// безопасного закрытия зависших WebRTC-сессий через idle timeout.
export const realtimeVoiceSessions = pgTable('realtime_voice_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  anonymousSessionId: text('anonymous_session_id').notNull(),
  interviewSessionId: uuid('interview_session_id').references(
    () => interviewSessions.id
  ),
  status: text('status').default('active').notNull(),
  endReason: text('end_reason'),
  provider: text('provider').default('openai').notNull(),
  model: text('model').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds').default(0).notNull(),
  hardLimitSeconds: integer('hard_limit_seconds').default(1200).notNull(),
  idleTimeoutSeconds: integer('idle_timeout_seconds').default(30).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Прайс-лист моделей (USD за 1M токенов / за 1M символов). Источник истины
// для расчёта costUsd. Заполняется сидом из кода и может переопределяться.
export const aiModelPricing = pgTable('ai_model_pricing', {
  id: uuid('id').defaultRandom().primaryKey(),
  model: text('model').unique().notNull(),
  provider: text('provider').default('openai').notNull(),
  inputPerMTokensUsd: doublePrecision('input_per_m_tokens_usd').default(0).notNull(),
  cachedInputPerMTokensUsd: doublePrecision('cached_input_per_m_tokens_usd')
    .default(0)
    .notNull(),
  outputPerMTokensUsd: doublePrecision('output_per_m_tokens_usd').default(0).notNull(),
  audioInputPerMTokensUsd: doublePrecision('audio_input_per_m_tokens_usd')
    .default(0)
    .notNull(),
  audioOutputPerMTokensUsd: doublePrecision('audio_output_per_m_tokens_usd')
    .default(0)
    .notNull(),
  ttsPerMCharsUsd: doublePrecision('tts_per_m_chars_usd').default(0).notNull(),
  note: text('note'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

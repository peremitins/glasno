import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
  // Версия меняется после каждой загрузки и инвалидирует URL приватного API.
  avatarVersion: text('avatar_version'),
  role: text('role').default('user').notNull(),
  onboarding: jsonb('onboarding').notNull().default({}),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
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
  trainingMode: text('training_mode').default('candidate').notNull(),
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

// Персональные правила для основных вопросов интервью. Анонимный id хранится
// всегда, userId добавляется после входа — это позволяет не терять настройки
// гостя и при этом выбирать их по аккаунту на других устройствах.
export const interviewQuestionPreferences = pgTable(
  'interview_question_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id),
    anonymousSessionId: text('anonymous_session_id').notNull(),
    status: text('status').notNull(), // repeat | mastered | hidden
    question: text('question').notNull(),
    conceptKey: text('concept_key').notNull(),
    semantic: jsonb('semantic'),
    roleKey: text('role_key').notNull(),
    roleLabel: text('role_label').notNull(),
    level: text('level').notNull(),
    contextTags: jsonb('context_tags').notNull().default([]),
    focus: text('focus'),
    sourceSessionId: uuid('source_session_id').references(
      () => interviewSessions.id,
      { onDelete: 'set null' }
    ),
    sourceTurnId: uuid('source_turn_id').references(() => interviewTurns.id, {
      onDelete: 'set null',
    }),
    lastPracticedAt: timestamp('last_practiced_at', { withTimezone: true }),
    practiceCount: integer('practice_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('question_preferences_user_status_idx').on(
      table.userId,
      table.status
    ),
    index('question_preferences_anon_status_idx').on(
      table.anonymousSessionId,
      table.status
    ),
    uniqueIndex('question_preferences_user_concept_unique')
      .on(table.userId, table.roleKey, table.level, table.conceptKey)
      .where(sql`${table.userId} is not null`),
    uniqueIndex('question_preferences_anon_concept_unique')
      .on(
        table.anonymousSessionId,
        table.roleKey,
        table.level,
        table.conceptKey
      )
      .where(sql`${table.userId} is null`),
  ]
);

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
export const paymentOrders = pgTable(
  'payment_orders',
  {
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
    // Для обычной покупки это момент выдачи доступа, для подарка — момент
    // создания оплаченного entitlement. Оба пути используют поле как
    // идемпотентный флаг вебхука и checkout-status.
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('payment_orders_user_id_created_at_idx').on(
      table.userId,
      table.createdAt,
      table.id
    ),
  ]
);

// Оплаченный подарок закрепляется за email и начинает действовать только
// после подтверждённого входа получателя. Email хранится нормализованным.
export const giftEntitlements = pgTable(
  'gift_entitlements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => paymentOrders.id)
      .notNull(),
    purchaserUserId: uuid('purchaser_user_id')
      .references(() => users.id)
      .notNull(),
    recipientEmail: text('recipient_email').notNull(),
    // Nullable только для совместимости с подарками, созданными до появления
    // подписи. Все новые checkout-запросы требуют имя отправителя.
    senderName: text('sender_name'),
    planId: text('plan_id').notNull(),
    status: text('status').default('pending_payment').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimedByUserId: uuid('claimed_by_user_id').references(() => users.id),
    notificationStatus: text('notification_status')
      .default('pending')
      .notNull(),
    notificationAttempts: integer('notification_attempts')
      .default(0)
      .notNull(),
    notificationNextAttemptAt: timestamp('notification_next_attempt_at', {
      withTimezone: true,
    }),
    notificationSentAt: timestamp('notification_sent_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('gift_entitlements_order_id_uq').on(table.orderId),
    index('gift_entitlements_recipient_status_expiry_idx').on(
      table.recipientEmail,
      table.status,
      table.claimExpiresAt
    ),
    index('gift_entitlements_purchaser_created_at_idx').on(
      table.purchaserUserId,
      table.createdAt
    ),
    index('gift_entitlements_notification_queue_idx').on(
      table.notificationStatus,
      table.notificationNextAttemptAt
    ),
  ]
);

// Гранты доступа после успешной оплаты.
// Запись оплаченного доступа («Полный доступ» на срок). Одна строка на
// пользователя: продление и повторная покупка обновляют её, а не создают
// цепочку — так исключается сценарий «просроченная запись вечно кандидат
// на автосписание» (ТЗ тарифы v2).
export const userSubscriptions = pgTable(
  'user_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    planId: text('plan_id').notNull(),
    status: text('status').default('active').notNull(),
    provider: text('provider').default('yookassa').notNull(),
    providerPaymentId: text('provider_payment_id'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    // Автопродление по умолчанию включено при покупке себе (выключено для
    // подарков и когда карта не сохранилась). next_charge_at = момент
    // автосписания = current_period_end.
    autoRenew: boolean('auto_renew').default(false).notNull(),
    nextChargeAt: timestamp('next_charge_at', { withTimezone: true }),
    lastChargeAttemptAt: timestamp('last_charge_attempt_at', {
      withTimezone: true,
    }),
    lastChargeError: text('last_charge_error'),
    // Счётчик попыток текущего цикла списания: после MAX попыток
    // автопродление выключается. Сбрасывается при успешном продлении.
    chargeAttempts: integer('charge_attempts').default(0).notNull(),
    // Условия продления фиксируются в момент покупки: изменение цен
    // каталога не меняет цену уже обещанного продления.
    renewalPlanId: text('renewal_plan_id'),
    renewalAmountRub: integer('renewal_amount_rub'),
    // Идемпотентность предуведомления о списании (одно на период).
    renewalNoticeSentAt: timestamp('renewal_notice_sent_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Один платёж YooKassa не может породить две записи доступа (защита от
    // гонки «вебхук + поллинг checkout-status»).
    uniqueIndex('user_subscriptions_provider_payment_id_uq').on(
      table.providerPaymentId
    ),
    // Один базовый доступ на пользователя — инвариант модели v2.
    uniqueIndex('user_subscriptions_user_id_uq').on(table.userId),
  ]
);

// Привязанная карта для автосписаний (одна на пользователя, YooKassa
// payment_method). Хранится презентация карты для UI, сам PAN — у YooKassa.
export const userPaymentMethods = pgTable(
  'user_payment_methods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    provider: text('provider').default('yookassa').notNull(),
    providerPaymentMethodId: text('provider_payment_method_id').notNull(),
    // pending — привязка начата, ждём подтверждения на стороне YooKassa;
    // active — карта подтверждена и готова к автосписаниям.
    status: text('status').default('active').notNull(),
    methodType: text('method_type'),
    title: text('title'),
    cardBrand: text('card_brand'),
    cardLast4: text('card_last4'),
    cardExpiryMonth: text('card_expiry_month'),
    cardExpiryYear: text('card_expiry_year'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_payment_methods_user_id_uq').on(table.userId)]
);

// Леджер минут realtime voice: начисления (гранты) с сроком действия.
// Остаток = SUM(total_seconds - consumed_seconds) по активным грантам.
// Требование ТЗ: «хранить начисления минут, списания по realtime session
// events и срок действия add-on пакетов».
export const realtimeMinuteGrants = pgTable(
  'realtime_minute_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    planId: text('plan_id').notNull(),
    // subscription | addon | admin
    sourceType: text('source_type').notNull(),
    subscriptionId: uuid('subscription_id').references(() => userSubscriptions.id),
    providerPaymentId: text('provider_payment_id'),
    totalSeconds: integer('total_seconds').notNull(),
    consumedSeconds: integer('consumed_seconds').default(0).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('realtime_minute_grants_user_id_idx').on(table.userId, table.expiresAt),
  ]
);

// Списания минут: одна запись = списание с конкретного гранта по итогам
// realtime-сессии (аудит-след для поддержки и сверки).
export const realtimeMinuteDebits = pgTable(
  'realtime_minute_debits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    grantId: uuid('grant_id')
      .references(() => realtimeMinuteGrants.id)
      .notNull(),
    realtimeSessionId: uuid('realtime_session_id').references(
      () => realtimeVoiceSessions.id
    ),
    seconds: integer('seconds').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('realtime_minute_debits_user_id_idx').on(table.userId)]
);

// Учёт email/telegram_id, которым уже выдавался бесплатный voice-триал.
// Запись переживает удаление аккаунта (users.deletedAt/анонимизацию), чтобы
// новый аккаунт с тем же email или telegram_id не получил триал повторно.
export const trialGrantHistory = pgTable('trial_grant_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique(),
  telegramId: text('telegram_id').unique(),
  userId: uuid('user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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

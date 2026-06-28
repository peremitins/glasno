import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';

// МИНИМАЛЬНАЯ стартовая схема. Расширяем по мере реализации фич.
// Принцип Mentala: не удалять/не переименовывать поля без миграционного
// плана; новые поля добавлять, старые оставлять.

// Пользователь. Ключ привязки — telegram_id или email (passwordless).
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  telegramId: text('telegram_id').unique(),
  email: text('email').unique(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Сессия интервью.
export const interviewSessions = pgTable('interview_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  source: text('source').notNull(), // 'hh' | 'text' | 'profession'
  vacancyTitle: text('vacancy_title'),
  vacancyRaw: text('vacancy_raw'), // текст/описание вакансии
  role: text('role'),
  level: text('level'), // junior | middle | senior
  format: integer('format'), // кол-во вопросов
  language: text('language').default('ru').notNull(),
  interviewerMode: text('interviewer_mode'), // soft | neutral | strict
  status: text('status').default('created').notNull(), // created | running | done
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Реплики/ответы внутри сессии.
export const interviewTurns = pgTable('interview_turns', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .references(() => interviewSessions.id)
    .notNull(),
  index: integer('index').notNull(),
  question: text('question').notNull(),
  answerTranscript: text('answer_transcript'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Итоговый разбор сессии (оценки по критериям + рекомендации).
export const interviewReports = pgTable('interview_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .references(() => interviewSessions.id)
    .notNull(),
  overallScore: integer('overall_score'),
  criteria: jsonb('criteria'), // { structure, specificity, relevance, ... }
  recommendations: jsonb('recommendations'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// База вопросов (своя, генерируется LLM + вычитка).
export const questionBank = pgTable('question_bank', {
  id: uuid('id').defaultRandom().primaryKey(),
  domain: text('domain').notNull(), // сфера
  role: text('role'),
  type: text('type').notNull(), // hr | behavioral | professional | stress
  question: text('question').notNull(),
  strongAnswer: text('strong_answer'),
  commonMistakes: text('common_mistakes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

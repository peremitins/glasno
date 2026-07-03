import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/server/infrastructure/db/client';
import { recordAiUsageSafe } from '@/server/application/aiUsage/serviceFactory';
import { DrizzleBillingRepository } from '@/server/infrastructure/billing/drizzleBillingRepository';
import { apiError } from '@/server/utils/errors';
import type { RealtimeSessionEndReason } from '@/shared/dto';
import {
  REALTIME_VOICE_DEFAULT_HARD_LIMIT_SECONDS,
  REALTIME_VOICE_IDLE_TIMEOUT_SECONDS,
} from './realtimeVoiceLimits';
import { resolveRealtimeVoiceEndAt } from './realtimeVoiceUsage';

type RealtimeVoiceSessionRow =
  typeof schema.realtimeVoiceSessions.$inferSelect;

export interface StartRealtimeVoiceSessionInput {
  anonymousSessionId: string;
  userId?: string | null;
  interviewSessionId: string;
  model: string;
  maxDurationSeconds?: number;
  remainingSeconds?: number;
  // Admin: не ограничиваем леджером минут.
  unlimited?: boolean;
}

export async function startRealtimeVoiceSession(
  input: StartRealtimeVoiceSessionInput
): Promise<{
  id: string;
  maxDurationSeconds: number;
  idleTimeoutSeconds: number;
  remainingSeconds: number;
}> {
  if (!input.userId || Math.max(0, input.remainingSeconds ?? 0) <= 0) {
    throw apiError(
      'E_FORBIDDEN',
      'Минуты realtime voice закончились. Можно продолжить текстом или докупить пакет минут.'
    );
  }

  // Параллельные realtime-сессии запрещены: закрываем предыдущие активные,
  // чтобы минуты не списывались дважды и remaining не считался с гонкой.
  await endActiveRealtimeVoiceSessionsForUser(input.userId, 'superseded');

  // Пересчитываем остаток по леджеру ПОСЛЕ закрытия старых сессий: их
  // секунды уже списаны, гонка «две вкладки видят по 60 минут» исключена.
  let remainingSeconds = Math.max(0, input.remainingSeconds ?? 0);
  if (!input.unlimited) {
    const balance =
      await new DrizzleBillingRepository().getRealtimeMinuteBalance(
        input.userId
      );
    remainingSeconds = Math.min(remainingSeconds, balance.remainingSeconds);
  }
  if (remainingSeconds <= 0) {
    throw apiError(
      'E_FORBIDDEN',
      'Минуты realtime voice закончились. Можно продолжить текстом или докупить пакет минут.'
    );
  }

  const hardLimitSeconds = Math.max(
    1,
    Math.min(
      input.maxDurationSeconds ?? REALTIME_VOICE_DEFAULT_HARD_LIMIT_SECONDS,
      remainingSeconds
    )
  );
  const now = new Date();
  const db = getDb();
  const [row] = await db
    .insert(schema.realtimeVoiceSessions)
    .values({
      anonymousSessionId: input.anonymousSessionId,
      userId: input.userId ?? null,
      interviewSessionId: input.interviewSessionId,
      status: 'active',
      provider: 'openai',
      model: input.model,
      startedAt: now,
      lastActivityAt: now,
      hardLimitSeconds,
      idleTimeoutSeconds: REALTIME_VOICE_IDLE_TIMEOUT_SECONDS,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw apiError('E_UNKNOWN', 'Realtime voice session не создана');
  }

  return {
    id: row.id,
    maxDurationSeconds: hardLimitSeconds,
    idleTimeoutSeconds: REALTIME_VOICE_IDLE_TIMEOUT_SECONDS,
    remainingSeconds,
  };
}

export async function touchRealtimeVoiceSession(params: {
  realtimeSessionId: string;
  anonymousSessionId: string;
  userId?: string | null;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(schema.realtimeVoiceSessions)
    .set({
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.realtimeVoiceSessions.id, params.realtimeSessionId),
        isNull(schema.realtimeVoiceSessions.endedAt),
        ownerClause(params)
      )
    );
}

export async function endRealtimeVoiceSession(params: {
  realtimeSessionId: string;
  anonymousSessionId: string;
  userId?: string | null;
  reason: RealtimeSessionEndReason;
  now?: Date;
}): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.realtimeVoiceSessions)
    .where(
      and(
        eq(schema.realtimeVoiceSessions.id, params.realtimeSessionId),
        isNull(schema.realtimeVoiceSessions.endedAt),
        ownerClause(params)
      )
    )
    .limit(1);
  const session = rows[0];
  if (!session) return;

  const endedAt = resolveRealtimeVoiceEndAt({
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
    hardLimitMs:
      (session.hardLimitSeconds || REALTIME_VOICE_DEFAULT_HARD_LIMIT_SECONDS) *
      1000,
    idleTimeoutMs:
      (session.idleTimeoutSeconds || REALTIME_VOICE_IDLE_TIMEOUT_SECONDS) *
      1000,
    now: params.now,
  });
  const durationSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000)
  );

  await db
    .update(schema.realtimeVoiceSessions)
    .set({
      status:
        params.reason === 'network_error' || params.reason === 'provider_error'
          ? 'failed'
          : 'completed',
      endReason: params.reason,
      endedAt,
      durationSeconds,
      updatedAt: params.now ?? new Date(),
    })
    .where(eq(schema.realtimeVoiceSessions.id, session.id));

  await debitRealtimeMinutes(session, durationSeconds);
  recordRealtimeUsage(session, durationSeconds, params.reason);
}

// Закрывает все активные realtime-сессии пользователя (например, перед
// запуском новой). Списание минут происходит внутри endRealtimeVoiceSession.
export async function endActiveRealtimeVoiceSessionsForUser(
  userId: string,
  reason: RealtimeSessionEndReason
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.realtimeVoiceSessions.id,
      anonymousSessionId: schema.realtimeVoiceSessions.anonymousSessionId,
    })
    .from(schema.realtimeVoiceSessions)
    .where(
      and(
        eq(schema.realtimeVoiceSessions.userId, userId),
        isNull(schema.realtimeVoiceSessions.endedAt)
      )
    );
  for (const row of rows) {
    await endRealtimeVoiceSession({
      realtimeSessionId: row.id,
      anonymousSessionId: row.anonymousSessionId,
      userId,
      reason,
    });
  }
}

// Списание секунд из леджера минут. Ошибка списания не должна ронять
// завершение сессии — логируем и продолжаем (баланс сверяется по debits).
async function debitRealtimeMinutes(
  session: RealtimeVoiceSessionRow,
  durationSeconds: number
): Promise<void> {
  if (!session.userId || durationSeconds <= 0) return;
  try {
    await new DrizzleBillingRepository().debitRealtimeSeconds({
      userId: session.userId,
      seconds: durationSeconds,
      realtimeSessionId: session.id,
    });
  } catch (error) {
    console.error('[billing] realtime minutes debit failed', {
      realtimeSessionId: session.id,
      userId: session.userId,
      durationSeconds,
      error,
    });
  }
}

function recordRealtimeUsage(
  session: RealtimeVoiceSessionRow,
  durationSeconds: number,
  reason: RealtimeSessionEndReason
) {
  if (durationSeconds <= 0) return;
  recordAiUsageSafe({
    userId: session.userId,
    anonymousSessionId: session.anonymousSessionId,
    interviewSessionId: session.interviewSessionId,
    kind: 'realtime',
    provider: session.provider,
    model: session.model,
    audioSeconds: durationSeconds,
    raw: {
      realtimeSessionId: session.id,
      endReason: reason,
    },
  });
}

function ownerClause(params: {
  anonymousSessionId: string;
  userId?: string | null;
}) {
  return params.userId
    ? eq(schema.realtimeVoiceSessions.userId, params.userId)
    : eq(schema.realtimeVoiceSessions.anonymousSessionId, params.anonymousSessionId);
}

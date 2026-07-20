import { and, count, eq, isNull, or, sql } from 'drizzle-orm';
import { schema } from '@/server/infrastructure/db/client';
import type { getDb } from '@/server/infrastructure/db/client';
import type { BillingOwner } from '@/server/interface/billingRepository';

type Db = ReturnType<typeof getDb>;

function ownerWhere(owner: BillingOwner) {
  if (owner.userId) {
    return eq(schema.interviewSessions.userId, owner.userId);
  }
  return and(
    isNull(schema.interviewSessions.userId),
    eq(schema.interviewSessions.anonymousSessionId, owner.anonymousSessionId)
  );
}

// Использованные бесплатные интервью. Попытка триала расходуется в момент
// создания сессии: считаем все сессии владельца независимо от статуса —
// брошенное интервью тоже тратит попытку (его можно продолжить, но нельзя
// бесконечно начинать заново). Плюс неизменяемая история попыток для
// email/Telegram ID, переживающая удаление аккаунта и перелогин.
export async function countOwnerFreeSessionsUsed(
  db: Db,
  owner: BillingOwner
): Promise<number> {
  const [sessionCount] = await db
    .select({ value: count() })
    .from(schema.interviewSessions)
    .where(ownerWhere(owner))
    .limit(1);
  const createdSessions = Number(sessionCount?.value ?? 0);
  if (!owner.userId) return createdSessions;

  const [user] = await db
    .select({
      email: schema.users.email,
      telegramId: schema.users.telegramId,
    })
    .from(schema.users)
    .where(eq(schema.users.id, owner.userId))
    .limit(1);
  const email = user?.email?.trim().toLowerCase() || null;
  const telegramId = user?.telegramId || null;
  if (!email && !telegramId) return createdSessions;

  const [history] = await db
    .select({ id: schema.trialInterviewHistory.id })
    .from(schema.trialInterviewHistory)
    .where(
      or(
        email ? eq(schema.trialInterviewHistory.email, email) : sql`false`,
        telegramId
          ? eq(schema.trialInterviewHistory.telegramId, telegramId)
          : sql`false`
      )
    )
    .limit(1);

  return Math.max(createdSessions, history ? 1 : 0);
}

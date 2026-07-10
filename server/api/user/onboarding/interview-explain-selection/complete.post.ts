import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/server/infrastructure/db/client';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { OnboardingCompleteResponseDto } from '@/shared/dto';

function normalizeOnboarding(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

export default defineApiHandler(async (event) => {
  const auth = event.context.auth;
  if (!auth?.user?.id) {
    throw apiError('E_AUTH', 'Требуется авторизация');
  }

  const db = getDb();
  const userId = auth.user.id;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ onboarding: schema.users.onboarding })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const onboarding = normalizeOnboarding(current?.onboarding);
    onboarding.interviewExplainSelection = true;

    await tx
      .update(schema.users)
      .set({
        onboarding,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));
  });

  return OnboardingCompleteResponseDto.parse({
    ok: true,
    onboarding: {
      interviewExplainSelection: true,
    },
  });
});

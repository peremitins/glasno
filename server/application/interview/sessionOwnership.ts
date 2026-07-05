import { apiError } from '@/server/utils/errors';

export interface OwnedInterviewSessionLike {
  anonymousSessionId: string;
  userId: string | null;
}

// Единая проверка владения интервью-сессией: используется interviewService,
// reportService и learningTermsService, чтобы правила доступа не расходились.
export function assertOwnedInterviewSession<T extends OwnedInterviewSessionLike>(
  session: T | null | undefined,
  params: { anonymousSessionId: string; userId?: string | null }
): T {
  if (!session) {
    throw apiError('E_NOT_FOUND', 'Интервью не найдено');
  }
  const ownedByAnonymousSession =
    session.anonymousSessionId === params.anonymousSessionId;
  const ownedByUser = Boolean(
    params.userId && session.userId === params.userId
  );
  if (!ownedByAnonymousSession && !ownedByUser) {
    throw apiError('E_FORBIDDEN', 'Нет доступа к этому интервью');
  }
  return session;
}

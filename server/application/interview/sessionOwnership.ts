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
  const ownedByUser = params.userId && session.userId === params.userId;
  const ownedByAnonymousSession =
    !params.userId &&
    !session.userId &&
    session.anonymousSessionId === params.anonymousSessionId;
  if (!ownedByUser && !ownedByAnonymousSession) {
    throw apiError('E_FORBIDDEN', 'Нет доступа к этому интервью');
  }
  return session;
}

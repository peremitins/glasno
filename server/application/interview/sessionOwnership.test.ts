import { describe, expect, it } from 'vitest';
import { assertOwnedInterviewSession } from './sessionOwnership';

describe('assertOwnedInterviewSession', () => {
  it('does not grant authenticated access by anonymous cookie when session belongs to another user', () => {
    const session = {
      anonymousSessionId: 'anon_shared',
      userId: 'user_old',
    };

    let error: unknown;
    try {
      assertOwnedInterviewSession(session, {
        anonymousSessionId: 'anon_shared',
        userId: 'user_new',
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ data: { code: 'E_FORBIDDEN' } });
  });

  it('does not grant anonymous access to a user-owned session by old anonymous cookie', () => {
    const session = {
      anonymousSessionId: 'anon_shared',
      userId: 'user_old',
    };

    let error: unknown;
    try {
      assertOwnedInterviewSession(session, {
        anonymousSessionId: 'anon_shared',
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ data: { code: 'E_FORBIDDEN' } });
  });
});

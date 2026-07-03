import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
} from '@/server/interface/authRepository';
import {
  createOpaqueToken,
  hashOpaqueToken,
  hmacHex,
  safeEqual,
} from './authCrypto';

export const AUTH_COOKIE_NAME = 'glasno_auth';
export { CSRF_COOKIE_NAME } from '@/shared/constants';
export const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface AuthSessionContext {
  session: AuthSessionRecord;
  user: AuthUserRecord;
}

export interface CreatedAuthSession {
  session: AuthSessionRecord;
  cookieValue: string;
  csrfToken: string;
}

export class AuthSessionService {
  constructor(
    private readonly deps: {
      repository: Pick<
        AuthRepository,
        | 'createAuthSession'
        | 'findAuthSessionById'
        | 'findUserById'
        | 'touchAuthSession'
      >;
      sessionSecret: string;
    }
  ) {}

  async createForUser(userId: string): Promise<CreatedAuthSession> {
    const token = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_SECONDS * 1000);
    const session = await this.deps.repository.createAuthSession({
      userId,
      tokenHash: hashOpaqueToken(token),
      csrfTokenHash: hashOpaqueToken(csrfToken),
      expiresAt,
    });

    return {
      session,
      cookieValue: this.signCookieValue(session.id, token),
      csrfToken,
    };
  }

  async resolveFromCookie(rawCookie: string | undefined | null) {
    const parsed = this.parseCookieValue(rawCookie);
    if (!parsed) return null;

    const session = await this.deps.repository.findAuthSessionById(parsed.sessionId);
    if (!session || session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (!safeEqual(session.tokenHash, hashOpaqueToken(parsed.token))) return null;

    const user = await this.deps.repository.findUserById(session.userId);
    if (!user) return null;

    await this.deps.repository.touchAuthSession(session.id);
    return { session, user } satisfies AuthSessionContext;
  }

  validateCsrf(params: {
    session: AuthSessionRecord;
    cookieToken: string | undefined | null;
    headerToken: string | undefined | null;
  }): boolean {
    const { session, cookieToken, headerToken } = params;
    if (!cookieToken || !headerToken) return false;
    if (!safeEqual(cookieToken, headerToken)) return false;
    return safeEqual(session.csrfTokenHash, hashOpaqueToken(cookieToken));
  }

  signCookieValue(sessionId: string, token: string): string {
    const value = `${sessionId}.${token}`;
    return `${value}.${hmacHex(this.deps.sessionSecret, value)}`;
  }

  parseCookieValue(rawCookie: string | undefined | null) {
    if (!rawCookie) return null;
    const parts = rawCookie.split('.');
    if (parts.length !== 3) return null;

    const [sessionId, token, signature] = parts;
    if (!sessionId || !token || !signature) return null;

    const value = `${sessionId}.${token}`;
    const expected = hmacHex(this.deps.sessionSecret, value);
    if (!safeEqual(expected, signature)) return null;

    return { sessionId, token };
  }
}

import type { SessionContext } from '../utils/session';
import type { AuthSessionContext } from '../application/auth/authSessionService';

// Расширяем контекст h3-события нашими полями.
declare module 'h3' {
  interface H3EventContext {
    requestId?: string;
    session?: SessionContext;
    auth?: AuthSessionContext;
  }
}

export {};

export type AuthMode = 'signin' | 'signup';

type RouteQueryValue = string | null | Array<string | null> | undefined;

function firstQueryValue(value: RouteQueryValue): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function resolveAuthMode(value: RouteQueryValue): AuthMode {
  const mode = firstQueryValue(value);
  return mode === 'signup' || mode === 'register' ? 'signup' : 'signin';
}

export function resolveSafeNextPath(value: RouteQueryValue): string {
  const path = firstQueryValue(value);
  if (!path) return '/';
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

export function normalizeEmailCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

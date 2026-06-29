// Единый формат ошибок API: { error: { code, message, details } }.
// Коды и их HTTP-статусы — общие для всего бэкенда.

export const API_ERROR_CODES = [
  'E_VALIDATION',
  'E_AUTH',
  'E_FORBIDDEN',
  'E_RATE',
  'E_NOT_FOUND',
  'E_CONFLICT',
  'E_UPSTREAM',
  'E_UNKNOWN',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const STATUS: Record<ApiErrorCode, number> = {
  E_VALIDATION: 400,
  E_AUTH: 401,
  E_FORBIDDEN: 403,
  E_RATE: 429,
  E_NOT_FOUND: 404,
  E_CONFLICT: 409,
  E_UPSTREAM: 502,
  E_UNKNOWN: 500,
};

export interface ApiErrorData {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

// Расширенная ошибка: несёт statusCode и data в нашем формате.
export class ApiError extends Error {
  statusCode: number;
  data: ApiErrorData;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = STATUS[code];
    this.data = { code, message, details };
  }
}

// Удобный конструктор: throw apiError('E_NOT_FOUND', '...').
export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown
): ApiError {
  return new ApiError(code, message, details);
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function httpStatusFor(code: ApiErrorCode): number {
  return STATUS[code];
}

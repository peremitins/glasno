import type { UserRole } from '@/shared/dto';
import { apiError } from './errors';

const ROLE_ORDER: Record<UserRole, number> = {
  user: 1,
  admin: 2,
};

export function requireRole(
  currentRole: UserRole | null | undefined,
  requiredRole: UserRole
) {
  if (!currentRole) {
    throw apiError('E_AUTH', 'Нужна авторизация');
  }
  if (ROLE_ORDER[currentRole] < ROLE_ORDER[requiredRole]) {
    throw apiError('E_FORBIDDEN', 'Недостаточно прав');
  }
}

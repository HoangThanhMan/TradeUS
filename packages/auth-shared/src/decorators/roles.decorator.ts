import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@tradex/shared-types';

export const ROLES_KEY = 'roles';

/**
 * Decorator to set required roles for a route
 * Usage: @Roles(UserRole.ADMIN, UserRole.VIP)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

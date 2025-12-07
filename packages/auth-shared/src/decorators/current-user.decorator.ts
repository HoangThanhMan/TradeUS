import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IJwtPayload } from '@tradex/shared-types';

/**
 * Decorator to extract current user from request
 * Usage: @CurrentUser() user: IJwtPayload
 */
export const CurrentUser = createParamDecorator(
  (data: keyof IJwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as IJwtPayload;

    return data ? user?.[data] : user;
  },
);

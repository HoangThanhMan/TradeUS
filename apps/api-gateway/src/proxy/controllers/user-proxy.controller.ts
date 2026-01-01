import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ProxyService, ServiceName } from '../proxy.service';

// import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../../auth/guards/roles.guard';
// import { Roles } from '../../auth/decorators/roles.decorator';
// import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@tradex/auth-shared';
import { RolesGuard } from '@tradex/auth-shared';
import { Roles } from '@tradex/auth-shared';
import { CurrentUser } from '@tradex/auth-shared';

import { UpdateUserDto, UserRole } from '@tradex/shared-types';
import type { IJwtPayload } from '@tradex/shared-types';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get('profile')
  async getMyProfile(@CurrentUser() user: IJwtPayload) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'GET',
      path: `/users/${user.userId}`,
    });
  }

  @Put('profile')
  async updateMyProfile(
    @CurrentUser() user: IJwtPayload,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'PUT',
      path: `/users/${user.userId}`,
      data: updateUserDto,
    });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async getUserById(@Param('id') id: string) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'GET',
      path: `/users/${id}`,
    });
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async getAllUsers() {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'GET',
      path: '/users',
    });
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'PUT',
      path: `/users/${id}`,
      data: updateUserDto,
    });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async deleteUser(@Param('id') id: string) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'DELETE',
      path: `/users/${id}`,
    });
  }
}

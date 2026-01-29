import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req, // <--- 1. Thêm import Req
} from '@nestjs/common';
import { ProxyService, ServiceName } from '../proxy.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '@tradex/auth-shared';
import { UpdateUserDto, UserRole } from '@tradex/shared-types';
import type { IJwtPayload } from '@tradex/shared-types';
import type { Request } from 'express'; // <--- 2. Thêm type Request (nếu dùng express)

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get('profile')
  async getMyProfile(
    @CurrentUser() user: IJwtPayload,
    @Req() req: Request, // <--- 3. Inject Request vào để lấy headers
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'GET',
      path: `/users/${user.userId}`,
      headers: req.headers as Record<string, string>, // <--- 4. Chuyển tiếp headers (chứa Token)
    });
  }

  @Put('profile')
  async updateMyProfile(
    @CurrentUser() user: IJwtPayload,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: Request, // <--- Tương tự cho các hàm khác
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'PUT',
      path: `/users/${user.userId}`,
      data: updateUserDto,
      headers: req.headers as Record<string, string>,
    });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async getUserById(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'GET',
      path: `/users/${id}`,
      headers: req.headers as Record<string, string>,
    });
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async getAllUsers(@Req() req: Request) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'GET',
      path: '/users',
      headers: req.headers as Record<string, string>,
    });
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: Request,
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'PUT',
      path: `/users/${id}`,
      data: updateUserDto,
      headers: req.headers as Record<string, string>,
    });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async deleteUser(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'DELETE',
      path: `/users/${id}`,
      headers: req.headers as Record<string, string>,
    });
  }
}
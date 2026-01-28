import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '@tradex/auth-shared';
import { 
  UserRole, 
  VipPlan, 
  UpdateQrConfigDto, 
  ProcessVipRequestDto 
} from '@tradex/shared-types';
import type { IJwtPayload } from '@tradex/shared-types';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // =================== QR Config ===================
  @Get('qr-config')
  async getQrConfig() {
    return this.adminService.getQrConfig();
  }

  @Put('qr-config')
  async updateQrConfig(@Body() dto: UpdateQrConfigDto) {
    return this.adminService.updateQrConfig(dto);
  }

  // =================== VIP Requests ===================
  @Get('vip-requests')
  async getVipRequests(
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (status === 'pending') {
      return this.adminService.getPendingRequests();
    }
    return this.adminService.getAllRequests(page || 1, limit || 20);
  }

  @Put('vip-requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveVipRequest(
    @Param('id') id: string,
    @CurrentUser() admin: IJwtPayload,
  ) {
    return this.adminService.approveVipRequest(id, admin.userId);
  }

  @Put('vip-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectVipRequest(
    @Param('id') id: string,
    @CurrentUser() admin: IJwtPayload,
    @Body() dto: ProcessVipRequestDto,
  ) {
    return this.adminService.rejectVipRequest(id, admin.userId, dto.note);
  }
}

// Public endpoint for users to create VIP request
@Controller('vip')
@UseGuards(JwtAuthGuard)
export class VipController {
  constructor(private readonly adminService: AdminService) {}

  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async createVipRequest(
    @CurrentUser() user: IJwtPayload,
    @Body('plan') plan: VipPlan,
  ) {
    return this.adminService.createVipRequest(
      user.userId,
      user.username || user.email,
      user.email,
      plan,
    );
  }

  @Get('config')
  async getPublicQrConfig() {
    return this.adminService.getQrConfig();
  }
}
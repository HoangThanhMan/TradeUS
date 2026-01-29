import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ProxyService, ServiceName } from '../proxy.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '@tradex/auth-shared';
import { UserRole, UpdateQrConfigDto, VipPlan } from '@tradex/shared-types';
import type { IJwtPayload } from '@tradex/shared-types';
import type { Request } from 'express';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  // =================== QR Config ===================
  @Get('qr-config')
  async getQrConfig(@Req() req: Request) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'GET',
      path: '/admin/qr-config',
      headers: req.headers as Record<string, string>,
    });
  }

  @Put('qr-config')
  async updateQrConfig(
    @Body() dto: UpdateQrConfigDto,
    @Req() req: Request,
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'PUT',
      path: '/admin/qr-config',
      data: dto,
      headers: req.headers as Record<string, string>,
    });
  }

  // =================== VIP Requests ===================
  @Get('vip-requests')
  async getVipRequests(
    @Query('status') status: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Req() req: Request,
  ) {
    const queryParams = new URLSearchParams();
    if (status) queryParams.append('status', status);
    if (page) queryParams.append('page', String(page));
    if (limit) queryParams.append('limit', String(limit));
    
    return this.proxyService.forward(ServiceName.USER, {
      method: 'GET',
      path: `/admin/vip-requests?${queryParams.toString()}`,
      headers: req.headers as Record<string, string>,
    });
  }

  @Put('vip-requests/:id/approve')
  async approveVipRequest(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'PUT',
      path: `/admin/vip-requests/${id}/approve`,
      headers: req.headers as Record<string, string>,
    });
  }

  @Put('vip-requests/:id/reject')
  async rejectVipRequest(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Req() req: Request,
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'PUT',
      path: `/admin/vip-requests/${id}/reject`,
      data: body,
      headers: req.headers as Record<string, string>,
    });
  }
}

// Public VIP endpoints
@Controller('vip')
@UseGuards(JwtAuthGuard)
export class VipProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('request')
  async createVipRequest(
    @Body('plan') plan: VipPlan,
    @Req() req: Request,
  ) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'POST',
      path: '/vip/request',
      data: { plan },
      headers: req.headers as Record<string, string>,
    });
  }

  @Get('config')
  async getPublicQrConfig(@Req() req: Request) {
    return this.proxyService.forward(ServiceName.USER, {
      method: 'GET',
      path: '/vip/config',
      headers: req.headers as Record<string, string>,
    });
  }
}
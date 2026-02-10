import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProxyService, ServiceName } from '../proxy.service';
import { JwtAuthGuard } from '@tradex/auth-shared';

/**
 * Proxy controller for Symbol Subscription Service
 * Routes: /subscriptions/*
 */
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post()
  async subscribe(@Body() body: { user_id: string; symbol: string }) {
    return this.proxyService.forward(ServiceName.SUBSCRIPTION, {
      method: 'POST',
      path: '/api/subscriptions/',
      data: body,
    });
  }

  @Delete()
  async unsubscribe(
    @Query('user_id') userId: string,
    @Query('symbol') symbol: string,
  ) {
    return this.proxyService.forward(ServiceName.SUBSCRIPTION, {
      method: 'DELETE',
      path: '/api/subscriptions/',
      query: { user_id: userId, symbol },
    });
  }

  @Get('user/:userId')
  async getUserSubscriptions(@Param('userId') userId: string) {
    return this.proxyService.forward(ServiceName.SUBSCRIPTION, {
      method: 'GET',
      path: `/api/subscriptions/user/${userId}`,
    });
  }

  @Get('symbol/:symbol/subscribers')
  async getSymbolSubscribers(@Param('symbol') symbol: string) {
    return this.proxyService.forward(ServiceName.SUBSCRIPTION, {
      method: 'GET',
      path: `/api/subscriptions/symbol/${symbol}/subscribers`,
    });
  }

  @Get('check')
  async checkSubscription(
    @Query('user_id') userId: string,
    @Query('symbol') symbol: string,
  ) {
    return this.proxyService.forward(ServiceName.SUBSCRIPTION, {
      method: 'GET',
      path: '/api/subscriptions/check',
      query: { user_id: userId, symbol },
    });
  }
}

import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  private readonly instanceId: string;
  private readonly startedAt: number;

  constructor(private readonly configService: ConfigService) {
    this.instanceId = this.configService.get<string>('instanceId', 'ws-gateway-1');
    this.startedAt = Date.now();
  }

  @Get()
  health() {
    return {
      status: 'ok',
      instanceId: this.instanceId,
      uptime: Date.now() - this.startedAt,
      timestamp: Date.now(),
    };
  }

  @Get('ready')
  ready() {
    return {
      status: 'ready',
      instanceId: this.instanceId,
      timestamp: Date.now(),
    };
  }

  @Get('live')
  live() {
    return {
      status: 'live',
      instanceId: this.instanceId,
      timestamp: Date.now(),
    };
  }
}

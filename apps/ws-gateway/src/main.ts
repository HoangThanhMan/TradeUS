import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('WsGateway');

  const port = configService.get<number>('PORT', 3002);
  const instanceId = configService.get<string>('INSTANCE_ID', 'ws-gateway-1');
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3000');

  // Configure Socket.IO adapter with CORS
  const ioAdapter = new IoAdapter(app);
  app.useWebSocketAdapter(ioAdapter);

  // Enable CORS for REST endpoints (health checks)
  app.enableCors({
    origin: corsOrigins.split(','),
    credentials: true,
  });

  await app.listen(port);
  
  logger.log(`WebSocket Gateway [${instanceId}] is running on port ${port}`);
  logger.log(`WebSocket endpoint: ws://localhost:${port}`);
}

bootstrap();

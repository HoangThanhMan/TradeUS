import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log('🔑 Gateway JWT_SECRET:', (process.env.JWT_SECRET || '').substring(0, 3));
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS configuration
// CORS configuration
app.enableCors({
  origin: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',  // Frontend port
    'http://localhost:3001'   // Backend port 
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
});

  // Global prefix
  app.setGlobalPrefix('api/v1');

  const port = configService.get<number>('port') || 3001;
  await app.listen(port);

  logger.log(`API Gateway is running on: http://localhost:${port}/api/v1`);
  logger.log(`Auth endpoints: http://localhost:${port}/api/v1/auth`);
}

bootstrap();

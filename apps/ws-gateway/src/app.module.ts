import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PriceGatewayModule } from './gateway/price-gateway.module';
import { SentimentGatewayModule } from './gateway/sentiment-gateway.module';
import { AlertGatewayModule } from './gateway/alert-gateway.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { HealthModule } from './health/health.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    RabbitMQModule,
    PriceGatewayModule,
    SentimentGatewayModule,
    AlertGatewayModule,
    HealthModule,
  ],
})
export class AppModule {}

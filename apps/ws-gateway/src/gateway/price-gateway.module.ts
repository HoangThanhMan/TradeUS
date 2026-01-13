import { Module } from '@nestjs/common';
import { PriceGateway } from './price.gateway';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';

@Module({
  imports: [RabbitMQModule],
  providers: [PriceGateway],
  exports: [PriceGateway],
})
export class PriceGatewayModule {}

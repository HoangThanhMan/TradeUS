import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service';
import { PriceConsumerService } from './price-consumer.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RabbitMQService, PriceConsumerService],
  exports: [RabbitMQService, PriceConsumerService],
})
export class RabbitMQModule {}

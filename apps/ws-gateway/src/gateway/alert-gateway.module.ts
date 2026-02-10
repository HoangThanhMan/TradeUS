import { Module } from '@nestjs/common';
import { AlertGateway } from './alert.gateway';
import { AlertConsumerService } from '../rabbitmq/alert-consumer.service';

@Module({
  providers: [AlertGateway, AlertConsumerService],
  exports: [AlertGateway, AlertConsumerService],
})
export class AlertGatewayModule {}

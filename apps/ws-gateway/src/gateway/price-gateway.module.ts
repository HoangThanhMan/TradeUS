import { Module } from '@nestjs/common';
import { PriceGateway } from './price.gateway';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';
import { BinanceHistoricalService } from '../services/binance-historical.service';
import { PriceConsumerService } from '../rabbitmq/price-consumer.service';


@Module({
  imports: [RabbitMQModule],
  providers: [PriceGateway, BinanceHistoricalService, PriceConsumerService],
  exports: [PriceGateway],
})
export class PriceGatewayModule {}

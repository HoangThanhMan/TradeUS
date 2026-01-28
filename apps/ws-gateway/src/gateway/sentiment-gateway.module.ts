import { Module } from '@nestjs/common';
import { SentimentGateway } from './sentiment.gateway';
import { SentimentConsumerService } from '../rabbitmq/sentiment-consumer.service';
import { SentimentApiService } from '../services/sentiment-api.service';

@Module({
  providers: [SentimentGateway, SentimentConsumerService, SentimentApiService],
  exports: [SentimentGateway, SentimentConsumerService, SentimentApiService],
})
export class SentimentGatewayModule {}

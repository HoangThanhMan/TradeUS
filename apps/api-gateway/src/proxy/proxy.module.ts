import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ProxyService } from './proxy.service';
import { UserProxyController } from './controllers/user-proxy.controller';
import {
  SentimentProxyController,
  CollectorProxyController,
} from './controllers/sentiment-proxy.controller';
import { PredictionProxyController } from './controllers/prediction-proxy.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [
    UserProxyController,
    SentimentProxyController,
    CollectorProxyController,
    PredictionProxyController,
  ],
  providers: [
    ProxyService,
  ],
  exports: [ProxyService],
})
export class ProxyModule {}

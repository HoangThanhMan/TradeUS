// apps/ws-gateway/src/gateways/price.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PriceConsumerService, PriceEvent } from '../rabbitmq/price-consumer.service';
import { PriceMessage } from '@tradex/shared-types';
import { BinanceHistoricalService } from '../services/binance-historical.service';

interface SubscriptionPayload {
  symbols: string[];
  interval?: string;
}

interface ClientSubscription {
  symbols: Map<string, Set<string>>;
  subscribedAt: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/prices',
  transports: ['websocket', 'polling'],
})
export class PriceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PriceGateway.name);
  private readonly instanceId: string;
  private clientSubscriptions: Map<string, ClientSubscription> = new Map();
  private unsubscribeFromPrices: (() => void) | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly priceConsumerService: PriceConsumerService,
    private readonly binanceHistoricalService: BinanceHistoricalService,
  ) {
    this.instanceId = this.configService.get<string>('instanceId', 'ws-gateway-1');
  }

  afterInit(server: Server) {
    this.logger.log(`[${this.instanceId}] WebSocket Gateway initialized`);
  }

  async onModuleInit() {
    this.unsubscribeFromPrices = this.priceConsumerService.onPrice(
      (event: PriceEvent) => {
        this.handlePriceEvent(event);
      },
    );
  }


  handleConnection(client: Socket) {
    const clientId = client.id;
    const clientIp = client.handshake.address;
    
    this.clientSubscriptions.set(clientId, {
      symbols: new Map(),
      subscribedAt: Date.now(),
    });

    this.logger.log(
      `[${this.instanceId}] Client connected: ${clientId} from ${clientIp}`,
    );

    client.emit('connected', {
      clientId,
      instanceId: this.instanceId,
      timestamp: Date.now(),
    });

    this.broadcastStats();
  }

  handleDisconnect(client: Socket) {
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);

    if (subscription) {
      subscription.symbols.forEach((intervals, symbol) => {
        intervals.forEach(interval => {
          const roomKey = this.getRoomKey(symbol, interval);
          client.leave(roomKey);
        });
      });
    }

    this.clientSubscriptions.delete(clientId);
    
    this.logger.log(`[${this.instanceId}] Client disconnected: ${clientId}`);
    this.broadcastStats();
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscriptionPayload,
  ) {
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);

    if (!subscription) {
      return { success: false, error: 'Client not found' };
    }

    const symbols = payload.symbols.map((s) => s.toUpperCase());
    const interval = payload.interval || '1d';
    
    this.logger.log(
      `[${this.instanceId}] Subscribe request from ${clientId}: symbols=${symbols.join(',')}, interval=${interval}`,
    );
    
    // Add symbols to client's subscription
    for (const symbol of symbols) {
      if (!subscription.symbols.has(symbol)) {
        subscription.symbols.set(symbol, new Set());
      }

      const intervals = subscription.symbols.get(symbol)!;
      intervals.add(interval);

      const roomKey = this.getRoomKey(symbol, interval);
      client.join(roomKey);

      this.logger.log(
        `[${this.instanceId}] Client ${clientId} joined room: ${roomKey}`,
      );

      this.fetchAndSendHistoricalData(client, symbol, interval);
    }

    return {
      success: true,
      subscribedSymbols: symbols,
      interval,
      timestamp: Date.now(),
    };
  }

  /**
   * Fetch historical data from Binance và gửi cho client
   */
  private async fetchAndSendHistoricalData(
    client: Socket,
    symbol: string,
    interval: string,
  ): Promise<void> {
    try {
      const limit = this.binanceHistoricalService.getRecommendedLimit(interval);
      
      this.logger.log(
        `[${this.instanceId}] Fetching historical data for ${symbol}:${interval} (limit: ${limit})`,
      );

      const candles = await this.binanceHistoricalService.getHistoricalKlines(
        symbol,
        interval,
        limit,
      );

      if (candles.length > 0) {
        const historicalData = {
          symbol,
          interval,
          source: 'binance',
          dataType: 'historical' as const,
          count: candles.length,
          data: candles,
          fetchedAt: Date.now(),
        };

        this.logger.log(
          `[${this.instanceId}] Sending ${candles.length} candles to client ${client.id} for ${symbol}:${interval}`,
        );

        client.emit('historical', {
          symbol,
          interval,
          data: historicalData,
          instanceId: this.instanceId,
          timestamp: Date.now(),
        });
      } else {
        this.logger.warn(
          `[${this.instanceId}] No historical data available for ${symbol}:${interval}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[${this.instanceId}] Failed to fetch historical for ${symbol}:${interval}`,
        error,
      );
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscriptionPayload,
  ) {
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);

    if (!subscription) {
      return { success: false, error: 'Client not found' };
    }

    const symbols = payload.symbols.map((s) => s.toUpperCase());
    const interval = payload.interval || '1d';

    symbols.forEach((symbol) => {
      const intervals = subscription.symbols.get(symbol);
      
      if (intervals) {
        intervals.delete(interval);
        
        if (intervals.size === 0) {
          subscription.symbols.delete(symbol);
        }
      }

      const roomKey = this.getRoomKey(symbol, interval);
      client.leave(roomKey);

      this.logger.log(
        `[${this.instanceId}] Client ${clientId} left room: ${roomKey}`,
      );
    });

    this.logger.log(
      `[${this.instanceId}] Client ${clientId} unsubscribed from: ${symbols.join(', ')} [${interval}]`,
    );

    return {
      success: true,
      unsubscribedSymbols: symbols,
      interval,
      timestamp: Date.now(),
    };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return { pong: true, timestamp: Date.now(), instanceId: this.instanceId };
  }

  private handlePriceEvent(event: PriceEvent) {

    if (event.type === 'realtime') {
      const priceData = event.data as any;
      const symbol = priceData.symbol.toUpperCase();
      const interval = priceData.interval;

      if (!interval) {
        this.logger.log('Realtime price missing interval', priceData);
        return;
      }

      // If we have interval info, broadcast to specific room
      if (interval) {
        // this.logger.log('📤 EMIT TO GATEWAY', symbol, interval);
        const roomKey = this.getRoomKey(symbol, interval);
        
        this.server.to(roomKey).emit('price', {
          symbol,
          interval,
          data: priceData,
          instanceId: this.instanceId,
          timestamp: Date.now(),
        });

        // this.logger.log({
        //   symbol,
        //   interval,
        //   data: priceData,
        // }, 'Realtime price received');

        // this.logger.debug(
        //   `Broadcasted kline update to ${roomKey}: ${priceData.close}`,
        // );
      } else {
        this.server.to(`symbol:${symbol}`).emit('price', {
          symbol,
          data: priceData,
          instanceId: this.instanceId,
          timestamp: Date.now(),
        });
      }

      // Also broadcast to 'all' room
      this.server.to('all').emit('price', {
        symbol,
        interval,
        data: priceData,
        instanceId: this.instanceId,
        timestamp: Date.now(),
      });
    }
  }

  @SubscribeMessage('subscribeAll')
  handleSubscribeAll(@ConnectedSocket() client: Socket) {
    client.join('all');
    
    this.logger.log(
      `[${this.instanceId}] Client ${client.id} subscribed to all prices`,
    );

    return {
      success: true,
      message: 'Subscribed to all price updates',
      timestamp: Date.now(),
    };
  }

  @SubscribeMessage('unsubscribeAll')
  handleUnsubscribeAll(@ConnectedSocket() client: Socket) {
    client.leave('all');
    
    this.logger.log(
      `[${this.instanceId}] Client ${client.id} unsubscribed from all prices`,
    );

    return {
      success: true,
      message: 'Unsubscribed from all price updates',
      timestamp: Date.now(),
    };
  }

  private broadcastStats() {
    const stats = {
      instanceId: this.instanceId,
      connectedClients: this.clientSubscriptions.size,
      timestamp: Date.now(),
    };

    this.server.emit('stats', stats);
  }

  getStats() {
    const symbolCounts: Record<string, Record<string, number>> = {};
    
    this.clientSubscriptions.forEach((sub) => {
      sub.symbols.forEach((intervals, symbol) => {
        if (!symbolCounts[symbol]) {
          symbolCounts[symbol] = {};
        }
        
        intervals.forEach(interval => {
          symbolCounts[symbol][interval] = (symbolCounts[symbol][interval] || 0) + 1;
        });
      });
    });

    return {
      instanceId: this.instanceId,
      connectedClients: this.clientSubscriptions.size,
      symbolSubscriptions: symbolCounts,
      timestamp: Date.now(),
    };
  }

  private getRoomKey(symbol: string, interval: string): string {
    return `${symbol}:${interval}`;
  }
}
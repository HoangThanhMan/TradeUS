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
import {
  SentimentConsumerService,
  SentimentEvent,
} from '../rabbitmq/sentiment-consumer.service';
import { SentimentApiService } from '../services/sentiment-api.service';
import {
  SentimentResultMessage,
  SentimentAlertMessage,
  BatchCompleteMessage,
} from '@tradex/shared-types';

interface SentimentSubscriptionPayload {
  symbols: string[];
}

interface ClientSentimentSubscription {
  symbols: Set<string>;
  subscribedAt: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/sentiment',
  transports: ['websocket', 'polling'],
})
export class SentimentGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SentimentGateway.name);
  private readonly instanceId: string;
  private clientSubscriptions: Map<string, ClientSentimentSubscription> = new Map();
  private unsubscribeFromSentiment: (() => void) | null = null;
  private serverReady = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly sentimentConsumerService: SentimentConsumerService,
    private readonly sentimentApiService: SentimentApiService,
  ) {
    this.instanceId = this.configService.get<string>('instanceId', 'ws-gateway-1');
  }

  afterInit(server: Server) {
    this.serverReady = true;
    this.logger.log(`[${this.instanceId}] Sentiment WebSocket Gateway initialized`);
    
    // Register sentiment handler after server is ready
    this.unsubscribeFromSentiment = this.sentimentConsumerService.onSentiment(
      (event: SentimentEvent) => {
        this.handleSentimentEvent(event);
      },
    );
    this.logger.log(`[${this.instanceId}] Registered sentiment event handler`);
  }

  async onModuleInit() {
    // Handler registration moved to afterInit to ensure server is ready
  }

  handleConnection(client: Socket) {
    const clientId = client.id;
    const clientIp = client.handshake.address;

    this.clientSubscriptions.set(clientId, {
      symbols: new Set(),
      subscribedAt: Date.now(),
    });

    this.logger.log(
      `[${this.instanceId}] Sentiment client connected: ${clientId} from ${clientIp}`,
    );

    client.emit('connected', {
      clientId,
      instanceId: this.instanceId,
      timestamp: Date.now(),
      namespace: 'sentiment',
    });

    this.broadcastStats();
  }

  handleDisconnect(client: Socket) {
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);

    if (subscription) {
      subscription.symbols.forEach((symbol) => {
        const room = this.getSymbolRoom(symbol);
        client.leave(room);
      });
      this.clientSubscriptions.delete(clientId);
    }

    this.logger.log(`[${this.instanceId}] Sentiment client disconnected: ${clientId}`);
    this.broadcastStats();
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SentimentSubscriptionPayload,
  ) {
    const { symbols } = payload;
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);

    if (!subscription) {
      this.logger.warn(`No subscription found for client ${clientId}`);
      return { success: false, error: 'Client not found' };
    }

    const subscribedSymbols: string[] = [];

    symbols.forEach((symbol) => {
      const normalizedSymbol = symbol.toUpperCase();
      const room = this.getSymbolRoom(normalizedSymbol);

      subscription.symbols.add(normalizedSymbol);
      client.join(room);
      subscribedSymbols.push(normalizedSymbol);

      this.logger.log(
        `[${this.instanceId}] Client ${clientId} subscribed to sentiment for ${normalizedSymbol}`,
      );
    });

    // Also join broadcast rooms for alerts
    client.join('sentiment:alerts');
    client.join('sentiment:batch');

    // Send historical data to the client after subscribing
    this.sendHistoricalData(client, subscribedSymbols);

    return {
      success: true,
      subscribedSymbols,
      timestamp: Date.now(),
    };
  }

  /**
   * Send historical sentiment data to a newly subscribed client
   */
  private async sendHistoricalData(client: Socket, symbols: string[]) {
    try {
      for (const symbol of symbols) {
        const historicalData = await this.sentimentApiService.getRecentSentimentsBySymbol(
          symbol,
          20,
        );

        if (historicalData.length > 0) {
          // Send historical data as batch
          client.emit('sentiment:history', {
            symbol,
            data: historicalData,
            count: historicalData.length,
            isHistorical: true,
            timestamp: Date.now(),
          });

          this.logger.log(
            `[${this.instanceId}] Sent ${historicalData.length} historical sentiments for ${symbol} to client ${client.id}`,
          );
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send historical data: ${errorMessage}`);
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SentimentSubscriptionPayload,
  ) {
    const { symbols } = payload;
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);

    if (!subscription) {
      return { success: false, error: 'Client not found' };
    }

    const unsubscribedSymbols: string[] = [];

    symbols.forEach((symbol) => {
      const normalizedSymbol = symbol.toUpperCase();
      const room = this.getSymbolRoom(normalizedSymbol);

      if (subscription.symbols.has(normalizedSymbol)) {
        subscription.symbols.delete(normalizedSymbol);
        client.leave(room);
        unsubscribedSymbols.push(normalizedSymbol);
      }
    });

    return {
      success: true,
      unsubscribedSymbols,
      timestamp: Date.now(),
    };
  }

  @SubscribeMessage('getSubscriptions')
  handleGetSubscriptions(@ConnectedSocket() client: Socket) {
    const subscription = this.clientSubscriptions.get(client.id);

    if (!subscription) {
      return { success: false, error: 'Client not found' };
    }

    return {
      success: true,
      symbols: Array.from(subscription.symbols),
      subscribedAt: subscription.subscribedAt,
    };
  }

  private handleSentimentEvent(event: SentimentEvent) {
    // Check if server is ready before processing events
    if (!this.serverReady || !this.server) {
      this.logger.warn('Server not ready, skipping sentiment event');
      return;
    }

    const { type, routingKey, data } = event;

    switch (type) {
      case 'result':
        this.handleSentimentResult(data as SentimentResultMessage, routingKey);
        break;
      case 'alert':
        this.handleSentimentAlert(data as SentimentAlertMessage, routingKey);
        break;
      case 'batch_complete':
        this.handleBatchComplete(data as BatchCompleteMessage, routingKey);
        break;
    }
  }

  private handleSentimentResult(
    message: SentimentResultMessage,
    routingKey: string,
  ) {
    const symbol = message.data.symbol?.toUpperCase();
    if (!symbol) {
      this.logger.warn('Received sentiment result without symbol');
      return;
    }

    const room = this.getSymbolRoom(symbol);
    const roomSize = this.server?.sockets?.adapter?.rooms?.get(room)?.size || 0;

    // Always emit to the room (even if size is 0, the emit is a no-op)
    this.server.to(room).emit('sentiment:result', {
      type: 'result',
      symbol,
      data: message.data,
      timestamp: message.timestamp,
      source: message.source,
    });

    this.logger.debug(
      `[${this.instanceId}] Emitted sentiment result for ${symbol} to ${roomSize} clients`,
    );
  }

  private handleSentimentAlert(
    message: SentimentAlertMessage,
    routingKey: string,
  ) {
    const symbol = message.data.symbol?.toUpperCase();

    // Broadcast to specific symbol room
    if (symbol) {
      const room = this.getSymbolRoom(symbol);
      this.server.to(room).emit('sentiment:alert', {
        type: 'alert',
        symbol,
        data: message.data,
        timestamp: message.timestamp,
        source: message.source,
      });
    }

    // Also broadcast to general alerts room
    this.server.to('sentiment:alerts').emit('sentiment:alert', {
      type: 'alert',
      symbol,
      data: message.data,
      timestamp: message.timestamp,
      source: message.source,
    });

    this.logger.log(
      `[${this.instanceId}] Emitted sentiment alert: ${message.data.alert_type} for ${symbol}`,
    );
  }

  private handleBatchComplete(
    message: BatchCompleteMessage,
    routingKey: string,
  ) {
    // Broadcast batch complete to all subscribed clients
    this.server.to('sentiment:batch').emit('sentiment:batch_complete', {
      type: 'batch_complete',
      data: message.data,
      timestamp: message.timestamp,
      source: message.source,
    });

    // Also broadcast to each symbol that was analyzed
    message.data.symbols?.forEach((symbol: string) => {
      const room = this.getSymbolRoom(symbol.toUpperCase());
      this.server.to(room).emit('sentiment:batch_complete', {
        type: 'batch_complete',
        data: message.data,
        timestamp: message.timestamp,
        source: message.source,
      });
    });

    this.logger.log(
      `[${this.instanceId}] Emitted batch complete: ${message.data.total_analyzed} analyzed`,
    );
  }

  private getSymbolRoom(symbol: string): string {
    return `sentiment:${symbol}`;
  }

  private broadcastStats() {
    const stats = {
      totalClients: this.clientSubscriptions.size,
      instanceId: this.instanceId,
      timestamp: Date.now(),
    };

    this.server.emit('stats', stats);
  }

  /**
   * Get current gateway statistics
   */
  getStats() {
    const symbolSubscriptions: Record<string, number> = {};

    this.clientSubscriptions.forEach((subscription) => {
      subscription.symbols.forEach((symbol) => {
        symbolSubscriptions[symbol] = (symbolSubscriptions[symbol] || 0) + 1;
      });
    });

    return {
      totalClients: this.clientSubscriptions.size,
      symbolSubscriptions,
      instanceId: this.instanceId,
      handlerCount: this.sentimentConsumerService.getHandlerCount(),
      isConnected: this.sentimentConsumerService.isReady(),
    };
  }
}

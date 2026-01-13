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

interface SubscriptionPayload {
  symbols: string[];
}

interface ClientSubscription {
  symbols: Set<string>;
  subscribedAt: number;
}

@WebSocketGateway({
  cors: {
    origin: '*', // Will be configured via nginx in production
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
  ) {
    this.instanceId = this.configService.get<string>('instanceId', 'ws-gateway-1');
  }

  afterInit(server: Server) {
    this.logger.log(`[${this.instanceId}] WebSocket Gateway initialized`);
  }

  async onModuleInit() {
    // Subscribe to price events from RabbitMQ
    this.unsubscribeFromPrices = this.priceConsumerService.onPrice(
      (event: PriceEvent) => this.handlePriceEvent(event),
    );
    this.logger.log(`[${this.instanceId}] Subscribed to price events`);
  }

  handleConnection(client: Socket) {
    const clientId = client.id;
    const clientIp = client.handshake.address;
    
    this.clientSubscriptions.set(clientId, {
      symbols: new Set(),
      subscribedAt: Date.now(),
    });

    this.logger.log(
      `[${this.instanceId}] Client connected: ${clientId} from ${clientIp}`,
    );

    // Send connection acknowledgment
    client.emit('connected', {
      clientId,
      instanceId: this.instanceId,
      timestamp: Date.now(),
    });

    this.broadcastStats();
  }

  handleDisconnect(client: Socket) {
    const clientId = client.id;
    this.clientSubscriptions.delete(clientId);
    
    this.logger.log(`[${this.instanceId}] Client disconnected: ${clientId}`);
    this.broadcastStats();
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscriptionPayload,
  ) {
    const clientId = client.id;
    const subscription = this.clientSubscriptions.get(clientId);

    if (!subscription) {
      return { success: false, error: 'Client not found' };
    }

    const symbols = payload.symbols.map((s) => s.toUpperCase());
    
    // Add symbols to client's subscription
    symbols.forEach((symbol) => {
      subscription.symbols.add(symbol);
      client.join(`symbol:${symbol}`);
    });

    this.logger.log(
      `[${this.instanceId}] Client ${clientId} subscribed to: ${symbols.join(', ')}`,
    );

    return {
      success: true,
      subscribedSymbols: Array.from(subscription.symbols),
      timestamp: Date.now(),
    };
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

    // Remove symbols from client's subscription
    symbols.forEach((symbol) => {
      subscription.symbols.delete(symbol);
      client.leave(`symbol:${symbol}`);
    });

    this.logger.log(
      `[${this.instanceId}] Client ${clientId} unsubscribed from: ${symbols.join(', ')}`,
    );

    return {
      success: true,
      subscribedSymbols: Array.from(subscription.symbols),
      timestamp: Date.now(),
    };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return { pong: true, timestamp: Date.now(), instanceId: this.instanceId };
  }

  /**
   * Handle price events from RabbitMQ and broadcast to subscribed clients
   */
  private handlePriceEvent(event: PriceEvent) {
    if (event.type === 'realtime') {
      const priceData = event.data as PriceMessage;
      const symbol = priceData.symbol.toUpperCase();

      // Broadcast to all clients subscribed to this symbol
      this.server.to(`symbol:${symbol}`).emit('price', {
        symbol,
        data: priceData,
        instanceId: this.instanceId,
        timestamp: Date.now(),
      });

      // Also broadcast to 'all' room for clients who want all prices
      this.server.to('all').emit('price', {
        symbol,
        data: priceData,
        instanceId: this.instanceId,
        timestamp: Date.now(),
      });
    } else if (event.type === 'historical') {
      // Handle historical data - send to specific symbol room
      const symbol = event.data.symbol.toUpperCase();
      
      this.server.to(`symbol:${symbol}`).emit('historical', {
        symbol,
        data: event.data,
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

  /**
   * Broadcast connection stats
   */
  private broadcastStats() {
    const stats = {
      instanceId: this.instanceId,
      connectedClients: this.clientSubscriptions.size,
      timestamp: Date.now(),
    };

    this.server.emit('stats', stats);
  }

  /**
   * Get current stats
   */
  getStats() {
    const symbolCounts: Record<string, number> = {};
    
    this.clientSubscriptions.forEach((sub) => {
      sub.symbols.forEach((symbol) => {
        symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
      });
    });

    return {
      instanceId: this.instanceId,
      connectedClients: this.clientSubscriptions.size,
      symbolSubscriptions: symbolCounts,
      timestamp: Date.now(),
    };
  }
}

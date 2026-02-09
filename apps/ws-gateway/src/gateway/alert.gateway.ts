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
  AlertConsumerService,
  AlertEvent,
  AlertNotificationData,
} from '../rabbitmq/alert-consumer.service';

interface ClientAlertSubscription {
  symbols: Set<string>;
  subscribedAt: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/alerts',
  transports: ['websocket', 'polling'],
})
export class AlertGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AlertGateway.name);
  private readonly instanceId: string;
  private clientSubscriptions: Map<string, ClientAlertSubscription> = new Map();
  private unsubscribeFromAlerts: (() => void) | null = null;
  private serverReady = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly alertConsumerService: AlertConsumerService,
  ) {
    this.instanceId = this.configService.get<string>('instanceId', 'ws-gateway-1');
  }

  afterInit(server: Server) {
    this.serverReady = true;
    this.logger.log(`[${this.instanceId}] Alert WebSocket Gateway initialized`);

    // Register alert handler after server is ready
    this.unsubscribeFromAlerts = this.alertConsumerService.onAlert(
      (event: AlertEvent) => {
        this.handleAlertEvent(event);
      },
    );
    this.logger.log(`[${this.instanceId}] Registered alert event handler`);
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
      `[${this.instanceId}] Alert client connected: ${clientId} from ${clientIp}`,
    );

    client.emit('connected', {
      clientId,
      instanceId: this.instanceId,
      timestamp: Date.now(),
      namespace: 'alerts',
    });

    // Auto-join global alerts room
    client.join('alerts:global');
    this.broadcastStats();
  }

  handleDisconnect(client: Socket) {
    const clientId = client.id;
    this.clientSubscriptions.delete(clientId);
    this.logger.log(
      `[${this.instanceId}] Alert client disconnected: ${clientId}`,
    );
    this.broadcastStats();
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { symbols: string[] },
  ) {
    const clientId = client.id;
    const sub = this.clientSubscriptions.get(clientId);
    if (!sub) return { success: false, error: 'Client not found' };

    const subscribedSymbols: string[] = [];
    for (const symbol of payload.symbols) {
      const upper = symbol.toUpperCase();
      sub.symbols.add(upper);
      client.join(`alerts:${upper}`);
      subscribedSymbols.push(upper);
    }

    this.logger.log(
      `[${this.instanceId}] Client ${clientId} subscribed to alerts: ${subscribedSymbols.join(', ')}`,
    );

    return { success: true, subscribedSymbols };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { symbols: string[] },
  ) {
    const clientId = client.id;
    const sub = this.clientSubscriptions.get(clientId);
    if (!sub) return { success: false, error: 'Client not found' };

    const unsubscribedSymbols: string[] = [];
    for (const symbol of payload.symbols) {
      const upper = symbol.toUpperCase();
      sub.symbols.delete(upper);
      client.leave(`alerts:${upper}`);
      unsubscribedSymbols.push(upper);
    }

    this.logger.log(
      `[${this.instanceId}] Client ${clientId} unsubscribed from alerts: ${unsubscribedSymbols.join(', ')}`,
    );

    return { success: true, unsubscribedSymbols };
  }

  private handleAlertEvent(event: AlertEvent) {
    if (!this.serverReady || !this.server) return;

    const data = event.data;

    if (data.type === 'sentiment_alert' && data.symbol) {
      // Emit to symbol-specific room and global room
      const eventPayload = {
        type: 'sentiment_alert',
        symbol: data.symbol,
        data,
        timestamp: event.timestamp,
        source: event.source,
      };

      this.server.to(`alerts:${data.symbol.toUpperCase()}`).emit('alert:sentiment', eventPayload);
      this.server.to('alerts:global').except(`alerts:${data.symbol.toUpperCase()}`).emit('alert:sentiment', eventPayload);

      this.logger.log(
        `[${this.instanceId}] Emitted sentiment alert for ${data.symbol} (notified=${data.notified_count})`,
      );
    } else if (data.type === 'email_status') {
      // Emit email status to global room
      const eventPayload = {
        type: 'email_status',
        data,
        timestamp: event.timestamp,
        source: event.source,
      };

      this.server.to('alerts:global').emit('alert:email_status', eventPayload);

      this.logger.log(
        `[${this.instanceId}] Emitted email status: ${data.status} to ${data.to}`,
      );
    }
  }

  private broadcastStats() {
    if (!this.server) return;

    const stats = {
      connectedClients: this.clientSubscriptions.size,
      instanceId: this.instanceId,
      timestamp: Date.now(),
    };

    this.server.to('alerts:global').emit('alert:stats', stats);
  }
}

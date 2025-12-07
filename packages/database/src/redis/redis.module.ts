import Redis, { RedisOptions } from 'ioredis';

export class RedisModule {
  private static instance: RedisModule;
  private client: Redis | null = null;

  private constructor() {}

  public static getInstance(): RedisModule {
    if (!RedisModule.instance) {
      RedisModule.instance = new RedisModule();
    }
    return RedisModule.instance;
  }

  connect(options: RedisOptions): Redis {
    if (this.client) {
      console.log('Redis already connected');
      return this.client;
    }

    this.client = new Redis({
      ...options,
      lazyConnect: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('connect', () => {
      console.log('Redis connected successfully');
    });

    this.client.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    this.client.on('close', () => {
      console.log('Redis connection closed');
    });

    return this.client;
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      console.log('Redis disconnected');
    }
  }

  isReady(): boolean {
    return this.client?.status === 'ready';
  }
}

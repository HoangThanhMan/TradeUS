import { Redis } from 'ioredis';
import { RedisModule } from './redis.module';

/**
 * Redis Service with common operations
 */
export class RedisService {
  private client: Redis;

  constructor() {
    this.client = RedisModule.getInstance().getClient();
  }

  // Basic operations
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // JSON operations
  async getJSON<T>(key: string): Promise<T | null> {
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setJSON<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  // Hash operations
  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  // Rate limiting
  async rateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const current = await this.client.incr(key);

    if (current === 1) {
      await this.client.expire(key, windowSeconds);
    }

    return current <= limit;
  }

  // Cooldown mechanism
  async setCooldown(key: string, cooldownSeconds: number): Promise<void> {
    await this.set(key, '1', cooldownSeconds);
  }

  async isInCooldown(key: string): Promise<boolean> {
    const exists = await this.exists(key);
    return exists === 1;
  }

  // Cache patterns
  async cacheOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    const cached = await this.getJSON<T>(key);

    if (cached !== null) {
      return cached;
    }

    const fresh = await fetchFn();
    await this.setJSON(key, fresh, ttlSeconds);
    return fresh;
  }

  // Pub/Sub
  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  subscribe(channel: string, callback: (message: string) => void): void {
    const subscriber = this.client.duplicate();

    subscriber.subscribe(channel, (err) => {
      if (err) {
        console.error('Failed to subscribe:', err);
      }
    });

    subscriber.on('message', (_channel, message) => {
      callback(message);
    });
  }
}

import { Redis } from 'ioredis';

export interface SessionData {
  sessionId: string;
  createdAt: string;
  scene: Record<string, unknown>;
}

const SESSION_TTL = 86400; // 24 hours
const KEY_PREFIX = 'session:';

export class SessionStore {
  private redis: Redis;

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.redis.on('error', (err: Error) => console.error('[Redis]', err.message));
  }

  async createSession(id: string): Promise<SessionData> {
    const key = KEY_PREFIX + id;

    // Collision check
    const exists = await this.redis.exists(key);
    if (exists) throw new Error('SESSION_EXISTS');

    const data: SessionData = {
      sessionId: id,
      createdAt: new Date().toISOString(),
      scene: {},
    };

    await this.redis.set(key, JSON.stringify(data), 'EX', SESSION_TTL);
    return data;
  }

  async getSession(id: string): Promise<SessionData | null> {
    const raw = await this.redis.get(KEY_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  }

  async updateScene(id: string, scene: Record<string, unknown>): Promise<boolean> {
    const key = KEY_PREFIX + id;
    const raw = await this.redis.get(key);
    if (!raw) return false;

    const data = JSON.parse(raw) as SessionData;
    data.scene = { ...data.scene, ...scene };

    // Re-set with remaining TTL
    const ttl = await this.redis.ttl(key);
    await this.redis.set(key, JSON.stringify(data), 'EX', ttl > 0 ? ttl : SESSION_TTL);
    return true;
  }

  async saveYDoc(id: string, state: Uint8Array): Promise<void> {
    const key = 'ydoc:' + id;
    const ttl = await this.redis.ttl(KEY_PREFIX + id);
    await this.redis.set(key, Buffer.from(state), 'EX', ttl > 0 ? ttl : SESSION_TTL);
  }

  async loadYDoc(id: string): Promise<Uint8Array | null> {
    const buf = await this.redis.getBuffer('ydoc:' + id);
    return buf ? new Uint8Array(buf) : null;
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.redis.del('ydoc:' + id);
    const count = await this.redis.del(KEY_PREFIX + id);
    return count > 0;
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

import { Redis } from '@upstash/redis';

let client: Redis | null = null;

/** Vercel の Redis（Upstash）連携で UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN が付与される */
export function isRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

export function getRedis(): Redis {
  if (!isRedisConfigured()) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for Redis');
  }
  if (!client) {
    client = Redis.fromEnv();
  }
  return client;
}

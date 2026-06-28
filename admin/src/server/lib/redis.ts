import Redis from "ioredis";

const DEFAULT_REDIS_URL = "redis://redis:6379";

export const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt: number) => Math.min(attempt * 100, 1000),
});

redis.on("error", (error: Error) => {
  console.error("admin_redis_client_error", error);
});

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);

  if (!value) {
    return null;
  }

  return JSON.parse(value) as T;
}

export async function redisSetJson(
  key: string,
  value: unknown,
  ttlSeconds: number,
) {
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

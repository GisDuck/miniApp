import Redis from "ioredis";

const DEFAULT_REDIS_URL = "redis://redis:6379";

export const redis = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt) => Math.min(attempt * 100, 1000),
});

redis.on("error", () => {
  // Redis errors are returned from commands; this listener prevents noisy crashes.
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

export async function redisSetLock(
  key: string,
  value: string,
  ttlSeconds: number,
) {
  const result = await redis.set(key, value, "EX", ttlSeconds, "NX");

  return result === "OK";
}

export async function redisDelete(key: string) {
  await redis.del(key);
}

export async function redisReleaseLock(key: string, value: string) {
  const result = await redis.eval(
    `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    end

    return 0
    `,
    1,
    key,
    value,
  );

  return result === 1;
}

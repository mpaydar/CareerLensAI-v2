import { Redis } from "@upstash/redis";

let redisClient: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    redisClient = new Redis({ url: upstashUrl, token: upstashToken });
    return redisClient;
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    redisClient = new Redis({ url: kvUrl, token: kvToken });
    return redisClient;
  }

  redisClient = null;
  return null;
}

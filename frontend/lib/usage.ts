import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "@/lib/redis";
import type { User } from "@/lib/user-store";

export const FREE_AI_LIMIT = 3;
export const FREE_AI_WINDOW = "30 d" as const;

let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (ratelimit) {
    return ratelimit;
  }
  const redis = getRedis();
  if (!redis) {
    return null;
  }
  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(FREE_AI_LIMIT, FREE_AI_WINDOW),
    prefix: "ratelimit:free-ai",
  });
  return ratelimit;
}

export function getRateLimitIdentifier(
  userId: string | null,
  ip: string,
): string {
  if (userId) {
    return `user:${userId}`;
  }
  return `ip:${ip}`;
}

export type UsageStats = {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
};

export async function getUsageStats(
  identifier: string,
): Promise<UsageStats | null> {
  const limiter = getRatelimit();
  if (!limiter) {
    return {
      limit: FREE_AI_LIMIT,
      remaining: FREE_AI_LIMIT,
      reset: Date.now() + 30 * 24 * 60 * 60 * 1000,
      used: 0,
    };
  }

  const result = await limiter.getRemaining(identifier);
  const remaining = Math.max(0, result.remaining);
  return {
    limit: FREE_AI_LIMIT,
    remaining,
    reset: result.reset,
    used: Math.max(0, FREE_AI_LIMIT - remaining),
  };
}

export async function checkRateLimit(
  identifier: string,
  user: User | null,
): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}> {
  if (user?.plan === "pro") {
    return {
      success: true,
      limit: FREE_AI_LIMIT,
      remaining: FREE_AI_LIMIT,
      reset: Date.now(),
    };
  }

  const limiter = getRatelimit();
  if (!limiter) {
    return {
      success: true,
      limit: FREE_AI_LIMIT,
      remaining: FREE_AI_LIMIT,
      reset: Date.now(),
    };
  }

  const { success, limit, remaining, reset } = await limiter.limit(identifier);
  return { success, limit, remaining, reset };
}

export function getUpgradeUrl(): string {
  return (
    process.env.NEXT_PUBLIC_UPGRADE_URL?.trim() ||
    "mailto:support@careerlens.ai?subject=ResumeSnap%20Pro"
  );
}

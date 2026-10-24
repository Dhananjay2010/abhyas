import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
};

export type RateLimitType = "auth" | "session" | "expensive" | "default";

let hasWarnedNoRedis = false;

function createRedisInstance(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!hasWarnedNoRedis) {
      console.warn(
        "[rate-limit] Upstash Redis not configured. Rate limiting disabled in this environment. " +
          "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable.",
      );
      hasWarnedNoRedis = true;
    }
    return null;
  }

  return new Redis({ url, token });
}

const redis = createRedisInstance();

/**
 * Rate limiters by endpoint type.
 * 
 * Limits per IP per window:
 * - auth: 10 requests per 15 minutes (strict for auth callback and sign-in)
 * - session: 100 requests per minute (session actions during workout)
 * - expensive: 10 requests per minute (program generation, account deletion)
 * - default: 30 requests per minute (general server actions)
 */
type RateLimiters = Record<RateLimitType, Ratelimit>;

const limiters: RateLimiters | null = redis
  ? {
      auth: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "15 m"),
        prefix: "rl:auth",
      }),
      session: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, "1 m"),
        prefix: "rl:session",
      }),
      expensive: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 m"),
        prefix: "rl:expensive",
      }),
      default: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        prefix: "rl:default",
      }),
    }
  : null;

/**
 * Check rate limit for a given identifier and limit type.
 * 
 * When Redis is not configured, returns success=true (no-op mode).
 */
export async function checkRateLimit(
  identifier: string,
  type: RateLimitType = "default",
): Promise<RateLimitResult> {
  if (!limiters) {
    return {
      success: true,
      limit: Infinity,
      remaining: Infinity,
      reset: Date.now(),
    };
  }

  const limiter = limiters[type];
  const result = await limiter.limit(identifier);

  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
    retryAfter: result.success ? undefined : Math.ceil((result.reset - Date.now()) / 1000),
  };
}

/**
 * Extract client IP from request headers.
 * 
 * Vercel provides x-forwarded-for and x-real-ip.
 * Falls back to a placeholder for local dev.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0].trim();
    if (ip) return ip;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "127.0.0.1";
}

/**
 * Create a rate limit key combining IP and user ID (when authenticated).
 * 
 * This allows per-user limits even when IPs are shared (e.g., office networks).
 */
export function createRateLimitKey(ip: string, userId?: string): string {
  return userId ? `${ip}:${userId}` : ip;
}

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
let hasWarnedFailure = false;

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
 * Limits per window:
 * - auth: 60 requests per 10 minutes (unauthenticated, IP-based, generous for gym wifi)
 * - session: 100 requests per minute (per user, workout actions)
 * - expensive: 10 requests per minute (per user, program generation, account deletion)
 * - default: 30 requests per minute (per user, general server actions)
 * 
 * Keys: userId alone for authenticated users (so IP changes don't reset bucket),
 *       IP alone for unauthenticated (can't key by user).
 */
type RateLimiters = Record<RateLimitType, Ratelimit>;

const limiters: RateLimiters | null = redis
  ? {
      auth: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(60, "10 m"),
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

const RATE_LIMIT_TIMEOUT_MS = 500;

/**
 * Check rate limit for a given identifier and limit type.
 * 
 * When Redis is not configured, returns success=true (no-op mode).
 * 
 * **Fails open**: On any error or timeout, allows the request and logs a warning.
 * This prevents Upstash outages from breaking the app (e.g., logSet mid-workout).
 * 
 * Timeout is 500ms. Upstash REST is usually <50ms, so this catches real stalls
 * without adding noticeable latency to normal operations.
 */
export async function checkRateLimit(
  identifier: string,
  type: RateLimitType = "default",
  limiterOverride?: RateLimiters | null,
): Promise<RateLimitResult> {
  const activeLimiters = limiterOverride ?? limiters;
  
  if (!activeLimiters) {
    return {
      success: true,
      limit: Infinity,
      remaining: Infinity,
      reset: Date.now(),
    };
  }

  let timeoutId: NodeJS.Timeout | null = null;

  try {
    const limiter = activeLimiters[type];
    
    // Race the limit check against a timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Rate limit check timeout")), RATE_LIMIT_TIMEOUT_MS);
    });
    
    const result = await Promise.race([
      limiter.limit(identifier),
      timeoutPromise,
    ]);

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfter: result.success ? undefined : Math.ceil((result.reset - Date.now()) / 1000),
    };
  } catch (error) {
    // Fail open: allow the request on any error
    if (!hasWarnedFailure) {
      console.warn(
        "[rate-limit] Rate limit check failed, allowing request.",
        error instanceof Error ? error.message : String(error),
      );
      hasWarnedFailure = true;
    }
    
    return {
      success: true,
      limit: Infinity,
      remaining: Infinity,
      reset: Date.now(),
    };
  } finally {
    // Always clear the timeout to prevent leaks
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Extract client IP from a headers object.
 * 
 * On Vercel, prefers x-vercel-forwarded-for (most accurate), then x-real-ip,
 * then the first entry of x-forwarded-for.
 * 
 * Falls back to 127.0.0.1 for local dev. This puts all header-less requests
 * in one bucket locally, which is fine for development.
 */
export function getClientIpFromHeaders(headers: { get(name: string): string | null }): string {
  // Vercel's own header, most accurate (can be comma-separated list)
  const vercelForwarded = headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const ip = vercelForwarded.split(",")[0].trim();
    if (ip) return ip;
  }

  // x-real-ip is next best
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;

  // x-forwarded-for as fallback (first IP in chain)
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0].trim();
    if (ip) return ip;
  }

  // Local dev fallback - all requests without headers share one bucket
  return "127.0.0.1";
}

/**
 * Extract client IP from request headers.
 * 
 * Convenience wrapper around getClientIpFromHeaders for Request objects.
 */
export function getClientIp(request: Request): string {
  return getClientIpFromHeaders(request.headers);
}

/**
 * Create a rate limit key.
 * 
 * For authenticated users, keys by userId alone so phone hopping between wifi
 * and mobile data doesn't reset the bucket.
 * 
 * For unauthenticated routes, keys by IP.
 */
export function createRateLimitKey(ip: string, userId?: string): string {
  return userId ?? ip;
}


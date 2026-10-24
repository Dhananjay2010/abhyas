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

const RATE_LIMIT_TIMEOUT_MS = 2000;

/**
 * Check rate limit for a given identifier and limit type.
 * 
 * When Redis is not configured, returns success=true (no-op mode).
 * 
 * **Fails open**: On any error or timeout, allows the request and logs a warning.
 * This prevents Upstash outages from breaking the app (e.g., logSet mid-workout).
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

  try {
    const limiter = activeLimiters[type];
    
    // Race the limit check against a timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Rate limit check timeout")), RATE_LIMIT_TIMEOUT_MS);
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
  }
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

/**
 * Create test limiters for use in tests.
 * Uses an in-memory Map backend instead of Redis.
 */
export function createTestLimiters(config: {
  auth?: { limit: number; window: string };
  session?: { limit: number; window: string };
  expensive?: { limit: number; window: string };
  default?: { limit: number; window: string };
}): RateLimiters {
  // Create an in-memory Map to act as the backend
  const memory = new Map<string, { count: number; reset: number }>();
  
  const createMemoryLimiter = (limit: number, windowMs: number): Ratelimit => {
    return {
      limit: async (key: string) => {
        const now = Date.now();
        const entry = memory.get(key);
        
        if (!entry || entry.reset < now) {
          memory.set(key, { count: 1, reset: now + windowMs });
          return {
            success: true,
            limit,
            remaining: limit - 1,
            reset: now + windowMs,
            pending: Promise.resolve(),
          };
        }
        
        entry.count += 1;
        const success = entry.count <= limit;
        
        return {
          success,
          limit,
          remaining: Math.max(0, limit - entry.count),
          reset: entry.reset,
          pending: Promise.resolve(),
        };
      },
      resetKey: async () => {},
      getRemaining: async () => ({ success: true, limit: 0, remaining: 0, reset: 0, pending: Promise.resolve() }),
      blockUntilReady: async () => {},
    } as unknown as Ratelimit;
  };
  
  const parseWindow = (window: string): number => {
    const match = window.match(/^(\d+)\s*(m|s|h)$/);
    if (!match) throw new Error(`Invalid window format: ${window}`);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === "s") return value * 1000;
    if (unit === "m") return value * 60 * 1000;
    if (unit === "h") return value * 60 * 60 * 1000;
    throw new Error(`Unknown unit: ${unit}`);
  };
  
  return {
    auth: config.auth
      ? createMemoryLimiter(config.auth.limit, parseWindow(config.auth.window))
      : createMemoryLimiter(60, 600000),
    session: config.session
      ? createMemoryLimiter(config.session.limit, parseWindow(config.session.window))
      : createMemoryLimiter(100, 60000),
    expensive: config.expensive
      ? createMemoryLimiter(config.expensive.limit, parseWindow(config.expensive.window))
      : createMemoryLimiter(10, 60000),
    default: config.default
      ? createMemoryLimiter(config.default.limit, parseWindow(config.default.window))
      : createMemoryLimiter(30, 60000),
  };
}

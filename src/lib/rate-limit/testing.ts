import { Ratelimit } from "@upstash/ratelimit";
import type { RateLimitType } from "./index";

/**
 * Test-only limiters backed by an in-memory Map.
 * 
 * This is a simplified fake, not a real Ratelimit instance. It implements
 * just enough of the Ratelimit interface to test rate limiting logic without
 * requiring Redis.
 * 
 * Use this ONLY in tests. Production code uses the real Upstash Ratelimit.
 */
export function createTestLimiters(config: {
  auth?: { limit: number; window: string };
  session?: { limit: number; window: string };
  expensive?: { limit: number; window: string };
  default?: { limit: number; window: string };
}): Record<RateLimitType, Ratelimit> {
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
      getRemaining: async () => ({
        success: true,
        limit: 0,
        remaining: 0,
        reset: 0,
        pending: Promise.resolve(),
      }),
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

/**
 * Join code throttling: only misses (failed attempts) count.
 * Successful previews and redeems do NOT increment the counter.
 * 
 * Limit: 10 misses per user per 15 minutes.
 */

import { Redis } from "@upstash/redis";

const MISS_LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

let hasWarnedNoRedis = false;

function createRedisInstance(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!hasWarnedNoRedis) {
      console.warn(
        "[join-code-throttle] Upstash Redis not configured. Throttling disabled in this environment.",
      );
      hasWarnedNoRedis = true;
    }
    return null;
  }

  return new Redis({ url, token });
}

const redis = createRedisInstance();

/**
 * Check if the user has exceeded the miss threshold.
 * Returns null if OK, or an error message if throttled.
 */
export async function checkJoinCodeThrottle(userId: string): Promise<string | null> {
  if (!redis) {
    return null; // Throttling disabled
  }

  const key = `jc-throttle:${userId}`;
  
  try {
    const count = await redis.get<number>(key);
    
    if (count !== null && count >= MISS_LIMIT) {
      return "Too many failed attempts. Please try again in a few minutes.";
    }
    
    return null;
  } catch (error) {
    console.warn("[join-code-throttle] Check failed, allowing request:", error);
    return null; // Fail open
  }
}

/**
 * Increment the miss counter for a user.
 * Call this only when a join code attempt fails.
 */
export async function recordJoinCodeMiss(userId: string): Promise<void> {
  if (!redis) {
    return; // Throttling disabled
  }

  const key = `jc-throttle:${userId}`;
  
  try {
    const current = await redis.get<number>(key);
    const newCount = (current ?? 0) + 1;
    
    // Set with expiry (15 minutes from now)
    await redis.set(key, newCount, { px: WINDOW_MS });
  } catch (error) {
    console.warn("[join-code-throttle] Record failed:", error);
  }
}

/**
 * Reset the miss counter for a user.
 * Useful for testing or manual intervention.
 */
export async function resetJoinCodeThrottle(userId: string): Promise<void> {
  if (!redis) {
    return;
  }

  const key = `jc-throttle:${userId}`;
  
  try {
    await redis.del(key);
  } catch (error) {
    console.warn("[join-code-throttle] Reset failed:", error);
  }
}

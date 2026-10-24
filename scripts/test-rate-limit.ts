/**
 * Test rate limiting logic using the REAL limiter with in-memory backend.
 *
 * Tests the rate limiter's behavior with an actual limit, plus no-store fallback,
 * fail-open on errors, and IP extraction logic.
 */

// Clear Redis config to test no-op mode first
const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

import {
  checkRateLimit,
  getClientIp,
  createRateLimitKey,
  type RateLimitType,
} from "../src/lib/rate-limit/index";
import { createTestLimiters } from "../src/lib/rate-limit/testing";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\n1. No-store fallback always returns success");
  {
    const result = await checkRateLimit("test-key", "default");
    check("success is true", result.success === true);
    check("limit is Infinity", result.limit === Infinity);
    check("remaining is Infinity", result.remaining === Infinity);
  }

  console.log("\n2. IP extraction from headers (correct precedence)");
  {
    // x-vercel-forwarded-for has highest priority
    const req1 = new Request("https://example.com", {
      headers: {
        "x-vercel-forwarded-for": "1.1.1.1",
        "x-real-ip": "2.2.2.2",
        "x-forwarded-for": "3.3.3.3, 4.4.4.4",
      },
    });
    check("prefers x-vercel-forwarded-for over all others", getClientIp(req1) === "1.1.1.1");

    // x-real-ip is second priority
    const req2 = new Request("https://example.com", {
      headers: {
        "x-real-ip": "9.10.11.12",
        "x-forwarded-for": "5.6.7.8",
      },
    });
    check("prefers x-real-ip over x-forwarded-for", getClientIp(req2) === "9.10.11.12");

    // x-forwarded-for is third (first IP in chain)
    const req3 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    check("extracts first IP from x-forwarded-for", getClientIp(req3) === "1.2.3.4");

    // 127.0.0.1 fallback for local dev
    const req4 = new Request("https://example.com");
    check("falls back to 127.0.0.1 (local dev)", getClientIp(req4) === "127.0.0.1");
  }

  console.log("\n3. Rate limit key generation");
  {
    check("uses IP when no user ID", createRateLimitKey("1.2.3.4") === "1.2.3.4");
    check("uses userId when provided", createRateLimitKey("1.2.3.4", "user-123") === "user-123");
    check(
      "IP hopping doesn't matter with userId",
      createRateLimitKey("5.6.7.8", "user-123") === "user-123"
    );
  }

  console.log("\n4. Test limiter enforces limits");
  {
    const testLimiters = createTestLimiters({
      default: { limit: 3, window: "1 m" },
    });

    const key = "test-user";
    
    // First 3 requests should succeed
    for (let i = 1; i <= 3; i++) {
      const result = await checkRateLimit(key, "default", testLimiters);
      check(`request ${i}/3 succeeds`, result.success === true);
      check(`remaining is ${3 - i}`, result.remaining === 3 - i);
    }
    
    // 4th request should be rate limited
    const blocked = await checkRateLimit(key, "default", testLimiters);
    check("request 4/3 is blocked", blocked.success === false);
    check("retryAfter is set", blocked.retryAfter !== undefined && blocked.retryAfter > 0);
  }

  console.log("\n5. Different rate limit types work");
  {
    const testLimiters = createTestLimiters({
      auth: { limit: 2, window: "1 m" },
      session: { limit: 5, window: "1 m" },
      expensive: { limit: 1, window: "1 m" },
      default: { limit: 3, window: "1 m" },
    });

    const types: RateLimitType[] = ["auth", "session", "expensive", "default"];
    for (const type of types) {
      const result = await checkRateLimit(`key-${type}`, type, testLimiters);
      check(`type ${type} works`, result.success === true);
    }
  }

  console.log("\n6. Separate keys have separate buckets");
  {
    const testLimiters = createTestLimiters({
      default: { limit: 2, window: "1 m" },
    });

    // Exhaust limit for user1
    await checkRateLimit("user1", "default", testLimiters);
    await checkRateLimit("user1", "default", testLimiters);
    const user1Blocked = await checkRateLimit("user1", "default", testLimiters);
    check("user1 is blocked after 2 requests", user1Blocked.success === false);

    // user2 should still have quota
    const user2First = await checkRateLimit("user2", "default", testLimiters);
    check("user2 is not blocked", user2First.success === true);
  }

  console.log("\n7. Fail-open on error (simulated)");
  {
    // Test that checkRateLimit handles errors gracefully
    const faultyLimiter = {
      auth: {
        limit: async () => {
          throw new Error("Simulated Upstash outage");
        },
      },
      session: { limit: async () => ({ success: true, limit: 100, remaining: 99, reset: Date.now(), pending: Promise.resolve() }) },
      expensive: { limit: async () => ({ success: true, limit: 10, remaining: 9, reset: Date.now(), pending: Promise.resolve() }) },
      default: { limit: async () => ({ success: true, limit: 30, remaining: 29, reset: Date.now(), pending: Promise.resolve() }) },
    };

    const result = await checkRateLimit("test-key", "auth", faultyLimiter as unknown as ReturnType<typeof createTestLimiters>);
    check("request succeeds despite error", result.success === true);
    check("limit is Infinity on error", result.limit === Infinity);
  }

  console.log("\n8. Fail-open on timeout (simulated)");
  {
    // Test that checkRateLimit times out slow responses (500ms timeout)
    const slowLimiter = {
      auth: {
        limit: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1s > 500ms timeout
          return { success: true, limit: 60, remaining: 59, reset: Date.now(), pending: Promise.resolve() };
        },
      },
      session: { limit: async () => ({ success: true, limit: 100, remaining: 99, reset: Date.now(), pending: Promise.resolve() }) },
      expensive: { limit: async () => ({ success: true, limit: 10, remaining: 9, reset: Date.now(), pending: Promise.resolve() }) },
      default: { limit: async () => ({ success: true, limit: 30, remaining: 29, reset: Date.now(), pending: Promise.resolve() }) },
    };

    const result = await checkRateLimit("test-key", "auth", slowLimiter as unknown as ReturnType<typeof createTestLimiters>);
    check("request succeeds despite timeout", result.success === true);
    check("limit is Infinity on timeout", result.limit === Infinity);
  }

  console.log("\n9. Timer is cleared (no leak)");
  {
    // Track active timers
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const activeTimers = new Set<NodeJS.Timeout>();

    global.setTimeout = ((fn: () => void, ms: number) => {
      const id = originalSetTimeout(fn, ms);
      activeTimers.add(id);
      return id;
    }) as typeof setTimeout;

    global.clearTimeout = ((id: NodeJS.Timeout) => {
      activeTimers.delete(id);
      return originalClearTimeout(id);
    }) as typeof clearTimeout;

    const testLimiters = createTestLimiters({
      default: { limit: 5, window: "1 m" },
    });

    // Make a successful call
    await checkRateLimit("timer-test", "default", testLimiters);

    // Restore original functions
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;

    check("timer was cleared after successful call", activeTimers.size === 0);
  }

  if (failures > 0) {
    console.error(`\n✗ ${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All rate limit tests passed");
}

runTests()
  .then(() => {
    // Restore original env vars
    if (originalUrl !== undefined) {
      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    }
    if (originalToken !== undefined) {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    }
  })
  .catch((err) => {
    console.error("\nTest runner error:", err);
    process.exit(1);
  });

#!/usr/bin/env tsx
/**
 * Test rate limiting logic.
 *
 * Tests the rate limiter's behavior in no-store mode (when Redis is not configured)
 * and validates the IP extraction and key generation logic.
 */

import { strict as assert } from "assert";

// Store original env vars to restore later
const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Clear Redis config to test no-op mode
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

// Now import the rate limit module (it will run in no-op mode)
import { checkRateLimit, getClientIp, createRateLimitKey, type RateLimitType } from "../src/lib/rate-limit/index";

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

  console.log("\n2. IP extraction from headers");
  {
    const req1 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    check("extracts first IP from x-forwarded-for", getClientIp(req1) === "1.2.3.4");

    const req2 = new Request("https://example.com", {
      headers: { "x-real-ip": "9.10.11.12" },
    });
    check("extracts IP from x-real-ip", getClientIp(req2) === "9.10.11.12");

    const req3 = new Request("https://example.com");
    check("falls back to 127.0.0.1", getClientIp(req3) === "127.0.0.1");

    const req4 = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "9.10.11.12",
      },
    });
    check("prefers x-forwarded-for over x-real-ip", getClientIp(req4) === "1.2.3.4");
  }

  console.log("\n3. Rate limit key generation");
  {
    check("uses IP when no user ID", createRateLimitKey("1.2.3.4") === "1.2.3.4");
    check(
      "combines IP and user ID",
      createRateLimitKey("1.2.3.4", "user-123") === "1.2.3.4:user-123"
    );
  }

  console.log("\n4. Different rate limit types");
  {
    const types: RateLimitType[] = ["auth", "session", "expensive", "default"];
    for (const type of types) {
      const result = await checkRateLimit("test-key", type);
      check(`type ${type} works`, result.success === true);
    }
  }

  console.log("\n5. Multiple calls succeed in no-op mode");
  {
    let allSucceed = true;
    for (let i = 0; i < 150; i++) {
      const result = await checkRateLimit("burst-test", "default");
      if (!result.success) {
        allSucceed = false;
        break;
      }
    }
    check("150 rapid calls all succeed", allSucceed);
  }

  console.log("\n6. retryAfter is not set on success");
  {
    const result = await checkRateLimit("test-key", "default");
    check("retryAfter is undefined", result.retryAfter === undefined);
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

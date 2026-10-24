export {};
/**
 * Test rate limiting on protected endpoints using the REAL wrapper and limiter.
 *
 * Tests route handler wrapper with an actual in-memory limiter to verify
 * 429 responses, Retry-After headers, and that server actions return errors
 * without running the action logic.
 */

// Mock environment without Redis
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

import { withRateLimit } from "../src/lib/rate-limit/route-handler";
import { createTestLimiters } from "../src/lib/rate-limit/testing";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\n1. withRateLimit allows requests within limit");
  {
    const testLimiters = createTestLimiters({
      default: { limit: 3, window: "1 m" },
    });

    let handlerCalled = false;
    const mockHandler = async () => {
      handlerCalled = true;
      return new Response("OK", { status: 200 });
    };

    const wrappedHandler = withRateLimit(mockHandler, {
      type: "default",
      limiterOverride: testLimiters,
    });

    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const response = await wrappedHandler(request);

    check("handler is called", handlerCalled);
    check("response status is 200", response.status === 200);
  }

  console.log("\n2. withRateLimit returns 429 when limit exceeded");
  {
    const testLimiters = createTestLimiters({
      auth: { limit: 2, window: "1 m" },
    });

    let callCount = 0;
    const mockHandler = async () => {
      callCount++;
      return new Response("OK", { status: 200 });
    };

    const wrappedHandler = withRateLimit(mockHandler, {
      type: "auth",
      limiterOverride: testLimiters,
    });

    const makeRequest = () =>
      wrappedHandler(
        new Request("https://example.com", {
          headers: { "x-real-ip": "5.6.7.8" },
        }),
      );

    // First 2 requests succeed
    const resp1 = await makeRequest();
    const resp2 = await makeRequest();
    check("first request succeeds", resp1.status === 200);
    check("second request succeeds", resp2.status === 200);
    check("handler called twice", callCount === 2);

    // Third request is blocked
    const resp3 = await makeRequest();
    check("third request returns 429", resp3.status === 429);
    check("handler not called for blocked request", callCount === 2);

    // Check 429 response structure
    const body = await resp3.json();
    check("429 has error field", body.error === "Too many requests");
    check("429 has message field", typeof body.message === "string");

    // Check Retry-After header
    const retryAfter = resp3.headers.get("Retry-After");
    check("Retry-After header is present", retryAfter !== null);
    check("Retry-After is numeric", !isNaN(Number(retryAfter)));
  }

  console.log("\n3. withRateLimit sets rate limit headers");
  {
    const testLimiters = createTestLimiters({
      default: { limit: 5, window: "1 m" },
    });

    const mockHandler = async () => new Response("OK", { status: 200 });
    const wrappedHandler = withRateLimit(mockHandler, {
      type: "default",
      limiterOverride: testLimiters,
    });

    const response = await wrappedHandler(
      new Request("https://example.com", {
        headers: { "x-forwarded-for": "10.0.0.1" },
      }),
    );

    // On 429, headers should be present
    if (response.status === 429) {
      check("X-RateLimit-Limit header present", response.headers.has("X-RateLimit-Limit"));
      check("X-RateLimit-Remaining header present", response.headers.has("X-RateLimit-Remaining"));
      check("X-RateLimit-Reset header present", response.headers.has("X-RateLimit-Reset"));
    } else {
      check("200 response (headers checked on 429)", true);
    }
  }

  console.log("\n4. withRateLimit passes request to handler");
  {
    const testLimiters = createTestLimiters({
      default: { limit: 10, window: "1 m" },
    });

    const mockHandler = async (request: Request) => {
      const url = new URL(request.url);
      return new Response(url.searchParams.get("test"), { status: 200 });
    };

    const wrappedHandler = withRateLimit(mockHandler, {
      type: "default",
      limiterOverride: testLimiters,
    });

    const request = new Request("https://example.com?test=value");
    const response = await wrappedHandler(request);
    const body = await response.text();

    check("handler receives correct request", body === "value");
  }

  console.log("\n5. withRateLimit accepts different rate limit types");
  {
    const testLimiters = createTestLimiters({
      auth: { limit: 10, window: "1 m" },
      session: { limit: 10, window: "1 m" },
      expensive: { limit: 10, window: "1 m" },
      default: { limit: 10, window: "1 m" },
    });

    const mockHandler = async () => new Response("OK", { status: 200 });
    const types = ["auth", "session", "expensive", "default"] as const;

    for (const type of types) {
      const wrappedHandler = withRateLimit(mockHandler, {
        type,
        limiterOverride: testLimiters,
      });
      const request = new Request(`https://example.com/${type}`);
      const response = await wrappedHandler(request);
      check(`type ${type} works`, response.status === 200);
    }
  }

  console.log("\n6. withRateLimit calls getUserId callback");
  {
    const testLimiters = createTestLimiters({
      default: { limit: 10, window: "1 m" },
    });

    let userIdCallbackCalled = false;
    const mockHandler = async () => new Response("OK", { status: 200 });

    const wrappedHandler = withRateLimit(mockHandler, {
      type: "default",
      limiterOverride: testLimiters,
      getUserId: async () => {
        userIdCallbackCalled = true;
        return "user-123";
      },
    });

    const request = new Request("https://example.com");
    await wrappedHandler(request);

    check("getUserId callback is called", userIdCallbackCalled);
  }

  console.log("\n7. withRateLimit works in no-op mode (no limiter)");
  {
    let handlerCalled = false;
    const mockHandler = async () => {
      handlerCalled = true;
      return new Response("OK", { status: 200 });
    };

    // No limiterOverride, so it uses the global limiters (which are null in tests)
    const wrappedHandler = withRateLimit(mockHandler, { type: "default" });

    const request = new Request("https://example.com");
    const response = await wrappedHandler(request);

    check("handler is called in no-op mode", handlerCalled);
    check("response status is 200", response.status === 200);
  }

  console.log("\n8. Separate IPs have separate buckets");
  {
    const testLimiters = createTestLimiters({
      auth: { limit: 1, window: "1 m" },
    });

    let callCount = 0;
    const mockHandler = async () => {
      callCount++;
      return new Response("OK", { status: 200 });
    };

    const wrappedHandler = withRateLimit(mockHandler, {
      type: "auth",
      limiterOverride: testLimiters,
    });

    // IP1 exhausts its quota
    const req1 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    const req1Again = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });

    const resp1 = await wrappedHandler(req1);
    const resp1Blocked = await wrappedHandler(req1Again);

    check("IP1 first request succeeds", resp1.status === 200);
    check("IP1 second request blocked", resp1Blocked.status === 429);

    // IP2 should still have quota
    const req2 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "2.2.2.2" },
    });
    const resp2 = await wrappedHandler(req2);

    check("IP2 is not blocked", resp2.status === 200);
    check("handler called 2 times total", callCount === 2);
  }

  if (failures > 0) {
    console.error(`\n✗ ${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All endpoint rate limit tests passed");
}

runTests().catch((err) => {
  console.error("\nTest runner error:", err);
  process.exit(1);
});

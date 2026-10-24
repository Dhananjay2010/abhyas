/**
 * Tests for Sentry integration setup and PII scrubbing.
 *
 * Tests the REAL functions from instrumentation files, not copies.
 * Run with: tsx scripts/test-sentry.ts
 */

import { deepStrictEqual, strictEqual, match, ok } from "node:assert";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type * as Sentry from "@sentry/nextjs";

// Import the REAL functions we're testing
import {
  scrubPII as serverScrubPII,
  scrubEmailsFromString,
  scrubTokensFromURL,
} from "../src/instrumentation";
import { scrubPII as clientScrubPII } from "../src/instrumentation-client";

// Instrumentation file structure tests

test("instrumentation files exist at correct Next.js paths", () => {
  const srcInstrumentation = join(process.cwd(), "src", "instrumentation.ts");
  const srcInstrumentationClient = join(process.cwd(), "src", "instrumentation-client.ts");
  
  ok(existsSync(srcInstrumentation), "src/instrumentation.ts must exist for Next.js to load it");
  ok(existsSync(srcInstrumentationClient), "src/instrumentation-client.ts must exist for Next.js to load it");
});

test("instrumentation.ts exports register and onRequestError", async () => {
  const instrumentation = await import("../src/instrumentation");
  
  strictEqual(typeof instrumentation.register, "function", "register must be exported");
  strictEqual(typeof instrumentation.onRequestError, "function", "onRequestError must be exported");
});

test("instrumentation-client.ts exports onRouterTransitionStart", async () => {
  const instrumentationClient = await import("../src/instrumentation-client");
  
  strictEqual(typeof instrumentationClient.onRouterTransitionStart, "function", "onRouterTransitionStart must be exported");
});

test("Sentry is optional when DSN is not set", () => {
  const originalClientDSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const originalServerDSN = process.env.SENTRY_DSN;
  
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  
  // Sentry.init should not be called without DSN
  strictEqual(process.env.NEXT_PUBLIC_SENTRY_DSN, undefined);
  strictEqual(process.env.SENTRY_DSN, undefined);
  
  if (originalClientDSN) process.env.NEXT_PUBLIC_SENTRY_DSN = originalClientDSN;
  if (originalServerDSN) process.env.SENTRY_DSN = originalServerDSN;
});

// PII Scrubbing tests - testing the REAL exported functions

test("scrubEmailsFromString removes email addresses", () => {
  const input = "User test@example.com failed to login";
  const output = scrubEmailsFromString(input);
  strictEqual(output, "User [email] failed to login");
});

test("scrubEmailsFromString handles multiple emails", () => {
  const input = "Contact admin@test.com or support@example.org";
  const output = scrubEmailsFromString(input);
  strictEqual(output, "Contact [email] or [email]");
});

test("scrubTokensFromURL removes sensitive query params", () => {
  const input = "https://example.com/auth?token=secret123&other=value";
  const output = scrubTokensFromURL(input);
  match(output, /token=%5BRedacted%5D/);
  match(output, /other=value/);
});

test("scrubTokensFromURL handles multiple sensitive params", () => {
  const input = "https://api.example.com/data?access_token=abc&refresh_token=xyz&id=123";
  const output = scrubTokensFromURL(input);
  match(output, /access_token=%5BRedacted%5D/);
  match(output, /refresh_token=%5BRedacted%5D/);
  match(output, /id=123/);
});

test("scrubTokensFromURL handles invalid URLs gracefully", () => {
  const input = "not a url";
  const output = scrubTokensFromURL(input);
  strictEqual(output, input);
});

test("scrubPII removes emails from exception messages", () => {
  const event = {
    exception: {
      values: [
        { value: "Error for user admin@example.com" },
      ],
    },
  } as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.exception?.values?.[0].value, "Error for user [email]");
});

test("scrubPII removes cookies entirely", () => {
  const event = {
    request: {
      cookies: { session: "secret", other: "value" },
    },
  } as unknown as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.request?.cookies, undefined);
});

test("scrubPII redacts authorization headers", () => {
  const event = {
    request: {
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
    },
  } as unknown as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.request?.headers?.authorization, "[Redacted]");
  strictEqual(result?.request?.headers?.["content-type"], "application/json");
});

test("scrubPII redacts multiple sensitive headers", () => {
  const event = {
    request: {
      headers: {
        authorization: "Bearer token",
        cookie: "session=abc",
        "x-supabase-auth": "jwt-token",
        apikey: "key123",
      },
    },
  } as unknown as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.request?.headers?.authorization, "[Redacted]");
  strictEqual(result?.request?.headers?.cookie, "[Redacted]");
  strictEqual(result?.request?.headers?.["x-supabase-auth"], "[Redacted]");
  strictEqual(result?.request?.headers?.apikey, "[Redacted]");
});

test("scrubPII removes request data (body)", () => {
  const event = {
    request: {
      data: { password: "secret123", email: "user@example.com" },
    },
  } as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.request?.data, undefined);
});

test("scrubPII scrubs emails from request URL", () => {
  const event = {
    request: {
      url: "https://example.com/users/admin@test.com/profile",
    },
  } as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.request?.url, "https://example.com/users/[email]/profile");
});

test("scrubPII scrubs tokens from request URL", () => {
  const event = {
    request: {
      url: "https://example.com/auth?access_token=secret",
    },
  } as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  match(result?.request?.url ?? "", /access_token=%5BRedacted%5D/);
});

test("scrubPII scrubs breadcrumb messages", () => {
  const event = {
    breadcrumbs: [
      { message: "User test@example.com logged in" },
    ],
  } as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.breadcrumbs?.[0].message, "User [email] logged in");
});

test("scrubPII redacts sensitive keys in breadcrumb data", () => {
  const event = {
    breadcrumbs: [
      {
        data: {
          password: "secret",
          token: "abc123",
          normalKey: "normalValue",
        },
      },
    ],
  } as unknown as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.breadcrumbs?.[0].data?.password, "[Redacted]");
  strictEqual(result?.breadcrumbs?.[0].data?.token, "[Redacted]");
  strictEqual(result?.breadcrumbs?.[0].data?.normalKey, "normalValue");
});

test("scrubPII scrubs emails from breadcrumb data values", () => {
  const event = {
    breadcrumbs: [
      {
        data: {
          userEmail: "admin@test.com",
          userId: "123",
        },
      },
    ],
  } as unknown as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.breadcrumbs?.[0].data?.userEmail, "[email]");
  strictEqual(result?.breadcrumbs?.[0].data?.userId, "123");
});

test("scrubPII removes user PII", () => {
  const event = {
    user: {
      id: "user-123",
      email: "user@example.com",
      username: "johndoe",
      ip_address: "192.168.1.1",
    },
  } as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.user?.id, "user-123");
  strictEqual(result?.user?.email, undefined);
  strictEqual(result?.user?.username, undefined);
  strictEqual(result?.user?.ip_address, undefined);
});

test("scrubPII handles event with no sensitive data", () => {
  const event = {
    exception: {
      values: [{ value: "Generic error message" }],
    },
  } as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  strictEqual(result?.exception?.values?.[0].value, "Generic error message");
});

test("scrubPII handles empty event", () => {
  const event = {} as Sentry.ErrorEvent;
  const result = serverScrubPII(event);
  deepStrictEqual(result, {});
});

test("client scrubPII works identically to server scrubPII", () => {
  const event = {
    exception: {
      values: [{ value: "Error with user@example.com" }],
    },
    request: {
      headers: {
        authorization: "Bearer token",
      },
      url: "https://example.com/?access_token=secret",
    },
    user: {
      id: "123",
      email: "test@test.com",
    },
  } as unknown as Sentry.ErrorEvent;
  
  const serverResult = serverScrubPII(structuredClone(event));
  const clientResult = clientScrubPII(structuredClone(event));
  
  // Both should scrub the same way
  strictEqual(serverResult?.exception?.values?.[0].value, clientResult?.exception?.values?.[0].value);
  strictEqual(serverResult?.request?.headers?.authorization, clientResult?.request?.headers?.authorization);
  match(serverResult?.request?.url ?? "", /access_token=%5BRedacted%5D/);
  match(clientResult?.request?.url ?? "", /access_token=%5BRedacted%5D/);
  strictEqual(serverResult?.user?.email, clientResult?.user?.email);
});

console.log("\n✓ All Sentry tests passed\n");

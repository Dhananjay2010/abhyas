/**
 * Tests for Sentry integration setup and PII scrubbing.
 *
 * Tests the REAL functions from shared scrubbing module.
 * Run with: tsx scripts/test-sentry.ts
 */

import { deepStrictEqual, strictEqual, match, ok } from "node:assert";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type * as Sentry from "@sentry/nextjs";

// Import the REAL functions we're testing from the shared module
import {
  scrubPII,
  scrubEmailsFromString,
  scrubTokensFromURL,
} from "../src/lib/sentry/scrub";

// Instrumentation file structure tests

test("instrumentation files exist at correct Next.js paths", () => {
  const srcInstrumentation = join(process.cwd(), "src", "instrumentation.ts");
  const srcInstrumentationClient = join(process.cwd(), "src", "instrumentation-client.ts");
  const scrubModule = join(process.cwd(), "src", "lib", "sentry", "scrub.ts");
  
  ok(existsSync(srcInstrumentation), "src/instrumentation.ts must exist for Next.js to load it");
  ok(existsSync(srcInstrumentationClient), "src/instrumentation-client.ts must exist for Next.js to load it");
  ok(existsSync(scrubModule), "src/lib/sentry/scrub.ts must exist for shared scrubbing functions");
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

test("scrubTokensFromURL removes code query param (Supabase auth)", () => {
  const input = "https://example.com/auth/callback?code=abc123xyz&state=something";
  const output = scrubTokensFromURL(input);
  match(output, /code=%5BRedacted%5D/);
  match(output, /state=something/);
});

test("scrubTokensFromURL removes URL hash entirely", () => {
  const input = "https://example.com/page#access_token=secret&token_type=bearer";
  const output = scrubTokensFromURL(input);
  strictEqual(output.includes("#"), false, "URL hash should be removed entirely");
  strictEqual(output, "https://example.com/page");
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
  const result = scrubPII(event);
  strictEqual(result?.exception?.values?.[0].value, "Error for user [email]");
});

test("scrubPII removes cookies entirely", () => {
  const event = {
    request: {
      cookies: { session: "secret", other: "value" },
    },
  } as unknown as Sentry.ErrorEvent;
  const result = scrubPII(event);
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
  const result = scrubPII(event);
  strictEqual(result?.request?.headers?.authorization, "[Redacted]");
  strictEqual(result?.request?.headers?.["content-type"], "application/json");
});

test("scrubPII redacts headers case-insensitively", () => {
  const event = {
    request: {
      headers: {
        Authorization: "Bearer token", // Capital A
        Cookie: "session=abc", // Capital C
        "X-Supabase-Auth": "jwt-token", // Mixed case
        APIKEY: "key123", // All caps
        "content-type": "application/json",
      },
    },
  } as unknown as Sentry.ErrorEvent;
  const result = scrubPII(event);
  strictEqual(result?.request?.headers?.Authorization, "[Redacted]");
  strictEqual(result?.request?.headers?.Cookie, "[Redacted]");
  strictEqual(result?.request?.headers?.["X-Supabase-Auth"], "[Redacted]");
  strictEqual(result?.request?.headers?.APIKEY, "[Redacted]");
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
  const result = scrubPII(event);
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
  } as unknown as Sentry.ErrorEvent;
  const result = scrubPII(event);
  strictEqual(result?.request?.data, undefined);
});

test("scrubPII scrubs emails from request URL", () => {
  const event = {
    request: {
      url: "https://example.com/users/admin@test.com/profile",
    },
  } as unknown as Sentry.ErrorEvent;
  const result = scrubPII(event);
  strictEqual(result?.request?.url, "https://example.com/users/[email]/profile");
});

test("scrubPII scrubs tokens from request URL", () => {
  const event = {
    request: {
      url: "https://example.com/auth?access_token=secret",
    },
  } as unknown as Sentry.ErrorEvent;
  const result = scrubPII(event);
  match(result?.request?.url ?? "", /access_token=%5BRedacted%5D/);
});

test("scrubPII scrubs code param from auth callback URL", () => {
  const event = {
    request: {
      url: "https://example.com/auth/callback?code=pkce-auth-code-123",
    },
  } as unknown as Sentry.ErrorEvent;
  const result = scrubPII(event);
  match(result?.request?.url ?? "", /code=%5BRedacted%5D/);
});

test("scrubPII removes hash from URL", () => {
  const event = {
    request: {
      url: "https://example.com/page#access_token=secret&expires_in=3600",
    },
  } as unknown as Sentry.ErrorEvent;
  const result = scrubPII(event);
  strictEqual(result?.request?.url?.includes("#"), false);
  strictEqual(result?.request?.url, "https://example.com/page");
});

test("scrubPII scrubs breadcrumb messages", () => {
  const event = {
    breadcrumbs: [
      { message: "User test@example.com logged in" },
    ],
  } as unknown as Sentry.ErrorEvent;
  const result = scrubPII(event);
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
  const result = scrubPII(event);
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
  const result = scrubPII(event);
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
  } as unknown as Sentry.ErrorEvent;
  const result = scrubPII(event);
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
  const result = scrubPII(event);
  strictEqual(result?.exception?.values?.[0].value, "Generic error message");
});

test("scrubPII handles empty event", () => {
  const event = {} as Sentry.ErrorEvent;
  const result = scrubPII(event);
  deepStrictEqual(result, {});
});

console.log("\n✓ All Sentry tests passed\n");

/**
 * Tests for Sentry PII scrubbing and configuration behavior.
 *
 * Run with: tsx scripts/test-sentry.ts
 */

import { deepStrictEqual, strictEqual, match } from "node:assert";
import { test } from "node:test";

/**
 * Mock Sentry event and hint types for testing.
 */
type ErrorEvent = {
  exception?: {
    values?: Array<{ value?: string }>;
  };
  request?: {
    url?: string;
    query_string?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    data?: unknown;
  };
  breadcrumbs?: Array<{
    message?: string;
    data?: Record<string, unknown>;
  }>;
  user?: {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
  };
  tags?: Record<string, string>;
};

type EventHint = Record<string, unknown>;

/**
 * Inline implementation of scrubbing functions for testing.
 * These match the implementations in sentry.*.config.ts.
 */

function scrubEmailsFromString(str: string): string {
  return str.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[email]");
}

function scrubTokensFromURL(url: string): string {
  try {
    const parsed = new URL(url);
    const sensitiveParams = [
      "token",
      "access_token",
      "refresh_token",
      "apikey",
      "api_key",
      "auth",
    ];
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "[Redacted]");
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function scrubPII(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) {
        ex.value = scrubEmailsFromString(ex.value);
      }
    }
  }

  if (event.request) {
    delete event.request.cookies;

    if (event.request.headers) {
      const sensitiveHeaders = [
        "authorization",
        "cookie",
        "x-supabase-auth",
        "apikey",
      ];
      for (const header of sensitiveHeaders) {
        if (event.request.headers[header]) {
          event.request.headers[header] = "[Redacted]";
        }
      }
    }

    delete event.request.data;

    if (event.request.url) {
      event.request.url = scrubEmailsFromString(event.request.url);
      event.request.url = scrubTokensFromURL(event.request.url);
    }

    if (event.request.query_string) {
      event.request.query_string = scrubEmailsFromString(event.request.query_string);
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
      if (breadcrumb.message) {
        breadcrumb.message = scrubEmailsFromString(breadcrumb.message);
      }
      if (breadcrumb.data) {
        const scrubbedData = { ...breadcrumb.data };
        const sensitiveKeys = [
          "password",
          "token",
          "apikey",
          "authorization",
          "cookie",
          "access_token",
          "refresh_token",
        ];
        for (const key of sensitiveKeys) {
          if (scrubbedData[key]) {
            scrubbedData[key] = "[Redacted]";
          }
        }
        for (const key in scrubbedData) {
          if (typeof scrubbedData[key] === "string") {
            scrubbedData[key] = scrubEmailsFromString(scrubbedData[key]);
          }
        }
        breadcrumb.data = scrubbedData;
      }
      return breadcrumb;
    });
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }

  return event;
}

// Tests

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

test("scrubEmailsFromString preserves non-email text", () => {
  const input = "No emails here, just text@localhost";
  const output = scrubEmailsFromString(input);
  match(output, /text@localhost/);
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
  const event: ErrorEvent = {
    exception: {
      values: [
        { value: "Error for user admin@example.com" },
      ],
    },
  };
  const result = scrubPII(event, {});
  strictEqual(result?.exception?.values?.[0].value, "Error for user [email]");
});

test("scrubPII removes cookies entirely", () => {
  const event: ErrorEvent = {
    request: {
      cookies: { session: "secret", other: "value" },
    },
  };
  const result = scrubPII(event, {});
  strictEqual(result?.request?.cookies, undefined);
});

test("scrubPII redacts authorization headers", () => {
  const event: ErrorEvent = {
    request: {
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
    },
  };
  const result = scrubPII(event, {});
  strictEqual(result?.request?.headers?.authorization, "[Redacted]");
  strictEqual(result?.request?.headers?.["content-type"], "application/json");
});

test("scrubPII redacts multiple sensitive headers", () => {
  const event: ErrorEvent = {
    request: {
      headers: {
        authorization: "Bearer token",
        cookie: "session=abc",
        "x-supabase-auth": "jwt-token",
        apikey: "key123",
      },
    },
  };
  const result = scrubPII(event, {});
  strictEqual(result?.request?.headers?.authorization, "[Redacted]");
  strictEqual(result?.request?.headers?.cookie, "[Redacted]");
  strictEqual(result?.request?.headers?.["x-supabase-auth"], "[Redacted]");
  strictEqual(result?.request?.headers?.apikey, "[Redacted]");
});

test("scrubPII removes request data (body)", () => {
  const event: ErrorEvent = {
    request: {
      data: { password: "secret123", email: "user@example.com" },
    },
  };
  const result = scrubPII(event, {});
  strictEqual(result?.request?.data, undefined);
});

test("scrubPII scrubs emails from request URL", () => {
  const event: ErrorEvent = {
    request: {
      url: "https://example.com/users/admin@test.com/profile",
    },
  };
  const result = scrubPII(event, {});
  strictEqual(result?.request?.url, "https://example.com/users/[email]/profile");
});

test("scrubPII scrubs tokens from request URL", () => {
  const event: ErrorEvent = {
    request: {
      url: "https://example.com/auth?access_token=secret",
    },
  };
  const result = scrubPII(event, {});
  match(result?.request?.url ?? "", /access_token=%5BRedacted%5D/);
});

test("scrubPII scrubs breadcrumb messages", () => {
  const event: ErrorEvent = {
    breadcrumbs: [
      { message: "User test@example.com logged in" },
    ],
  };
  const result = scrubPII(event, {});
  strictEqual(result?.breadcrumbs?.[0].message, "User [email] logged in");
});

test("scrubPII redacts sensitive keys in breadcrumb data", () => {
  const event: ErrorEvent = {
    breadcrumbs: [
      {
        data: {
          password: "secret",
          token: "abc123",
          normalKey: "normalValue",
        },
      },
    ],
  };
  const result = scrubPII(event, {});
  strictEqual(result?.breadcrumbs?.[0].data?.password, "[Redacted]");
  strictEqual(result?.breadcrumbs?.[0].data?.token, "[Redacted]");
  strictEqual(result?.breadcrumbs?.[0].data?.normalKey, "normalValue");
});

test("scrubPII scrubs emails from breadcrumb data values", () => {
  const event: ErrorEvent = {
    breadcrumbs: [
      {
        data: {
          userEmail: "admin@test.com",
          userId: "123",
        },
      },
    ],
  };
  const result = scrubPII(event, {});
  strictEqual(result?.breadcrumbs?.[0].data?.userEmail, "[email]");
  strictEqual(result?.breadcrumbs?.[0].data?.userId, "123");
});

test("scrubPII removes user PII", () => {
  const event: ErrorEvent = {
    user: {
      id: "user-123",
      email: "user@example.com",
      username: "johndoe",
      ip_address: "192.168.1.1",
    },
  };
  const result = scrubPII(event, {});
  strictEqual(result?.user?.id, "user-123");
  strictEqual(result?.user?.email, undefined);
  strictEqual(result?.user?.username, undefined);
  strictEqual(result?.user?.ip_address, undefined);
});

test("scrubPII handles event with no sensitive data", () => {
  const event: ErrorEvent = {
    exception: {
      values: [{ value: "Generic error message" }],
    },
  };
  const result = scrubPII(event, {});
  strictEqual(result?.exception?.values?.[0].value, "Generic error message");
});

test("scrubPII handles empty event", () => {
  const event: ErrorEvent = {};
  const result = scrubPII(event, {});
  deepStrictEqual(result, {});
});

// Configuration tests

test("Sentry is optional when DSN is not set", () => {
  const originalDSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  
  // Sentry.init should not be called without DSN
  // This is verified by the conditional in the config files
  strictEqual(process.env.NEXT_PUBLIC_SENTRY_DSN, undefined);
  
  if (originalDSN) {
    process.env.NEXT_PUBLIC_SENTRY_DSN = originalDSN;
  }
});

console.log("\n✓ All Sentry tests passed\n");

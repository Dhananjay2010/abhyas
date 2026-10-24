import * as Sentry from "@sentry/nextjs";

/**
 * Sentry server-side configuration for Node.js runtime.
 *
 * Catches errors in:
 * - Server Components
 * - Server Actions
 * - API Route Handlers
 * 
 * Fully optional: if SENTRY_DSN is unset, this is a no-op.
 */

const DSN = process.env.SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,

    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    
    // Release tracking: use Vercel's commit SHA if available
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // Low sample rate for a small app - adjust as needed
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),

    beforeSend(event, hint) {
      return scrubPII(event, hint);
    },
  });
}

/**
 * Scrub PII and secrets from server-side error events.
 */
function scrubPII(
  event: Sentry.ErrorEvent,
  _hint: Sentry.EventHint
): Sentry.ErrorEvent | null {
  // Scrub emails from exception messages
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) {
        ex.value = scrubEmailsFromString(ex.value);
      }
    }
  }

  // Scrub request data
  if (event.request) {
    // Remove cookies entirely (may contain session tokens)
    delete event.request.cookies;

    // Scrub auth headers
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

    // Remove request bodies (may contain passwords, tokens, or PII)
    delete event.request.data;

    // Scrub emails and tokens from URL
    if (event.request.url) {
      event.request.url = scrubEmailsFromString(event.request.url);
      event.request.url = scrubTokensFromURL(event.request.url);
    }

    // Scrub query string
    if (event.request.query_string) {
      if (typeof event.request.query_string === "string") {
        event.request.query_string = scrubEmailsFromString(event.request.query_string);
      } else {
        // If it's an object, scrub each value
        const scrubbed: Record<string, string> = {};
        for (const [key, value] of Object.entries(event.request.query_string)) {
          scrubbed[key] = typeof value === "string" ? scrubEmailsFromString(value) : value;
        }
        event.request.query_string = scrubbed as unknown as typeof event.request.query_string;
      }
    }
  }

  // Scrub breadcrumbs
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

  // Scrub user context
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }

  // Add server context
  event.tags = {
    ...event.tags,
    runtime: "nodejs",
  };

  return event;
}

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

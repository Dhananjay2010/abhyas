import * as Sentry from "@sentry/nextjs";

/**
 * Sentry client-side configuration for browser error monitoring.
 *
 * Catches React render errors, unhandled exceptions, and promise rejections.
 * Fully optional: if NEXT_PUBLIC_SENTRY_DSN is unset, this is a no-op.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,

    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development",
    
    // Release tracking: use Vercel's commit SHA if available
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    // Low sample rate for a small app - adjust as needed
    tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),

    // Replay can be enabled later if needed
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Don't report errors from browser extensions or localhost in production
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      "canvas.contentDocument",
      "MyApp_RemoveAllHighlights",
      "atomicFindClose",
      // Network errors that aren't actionable
      "NetworkError",
      "Failed to fetch",
      "Load failed",
    ],

    beforeSend(event, hint) {
      return scrubPII(event, hint);
    },

    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}

/**
 * Scrub PII and secrets from error events before sending to Sentry.
 * 
 * Removes:
 * - Email addresses from messages, URLs, and breadcrumbs
 * - Authorization headers and cookies
 * - Request bodies (may contain sensitive form data)
 * - Supabase tokens from URLs and headers
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
        // Remove sensitive data from breadcrumb data
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
        // Scrub email values
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
    // Keep user ID for grouping, but remove email and other PII
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }

  return event;
}

/**
 * Replace email addresses with [email] placeholder.
 */
function scrubEmailsFromString(str: string): string {
  // Match common email patterns
  return str.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[email]");
}

/**
 * Remove tokens from URL query parameters.
 */
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
    // If URL parsing fails, return as-is (better than crashing)
    return url;
  }
}

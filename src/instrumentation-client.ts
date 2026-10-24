/**
 * Client-side instrumentation for Sentry.
 * 
 * This file runs before the app's frontend code starts, enabling:
 * - Browser error monitoring
 * - React error boundary integration
 * - Navigation span tracking
 * 
 * @see https://nextjs.org/docs/app/guides/analytics
 */

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,

    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development",
    
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),

    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

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

    beforeSend(event, _hint) {
      return scrubPII(event);
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
 * Scrub PII and secrets from client-side error events.
 * Exported for testing.
 */
export function scrubPII(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
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
      if (typeof event.request.query_string === "string") {
        event.request.query_string = scrubEmailsFromString(event.request.query_string);
      } else {
        const scrubbed: Record<string, string> = {};
        for (const [key, value] of Object.entries(event.request.query_string)) {
          scrubbed[key] = typeof value === "string" ? scrubEmailsFromString(value) : String(value);
        }
        event.request.query_string = scrubbed as unknown as typeof event.request.query_string;
      }
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

export function scrubEmailsFromString(str: string): string {
  return str.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[email]");
}

export function scrubTokensFromURL(url: string): string {
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

/**
 * Navigation span tracking for App Router.
 * 
 * Called by Next.js on route transitions to record navigation timing in Sentry.
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/routing-instrumentation/
 */
export async function onRouterTransitionStart(href: string, navigationType: string) {
  if (DSN) {
    const { captureRouterTransitionStart } = await import("@sentry/nextjs");
    captureRouterTransitionStart(href, navigationType);
  }
}

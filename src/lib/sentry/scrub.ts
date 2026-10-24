/**
 * PII and secrets scrubbing for Sentry error events.
 * 
 * Shared by server and client instrumentation.
 */

import type * as Sentry from "@sentry/nextjs";

/**
 * Scrub PII and secrets from error events before sending to Sentry.
 */
export function scrubPII(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
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
    delete event.request.cookies;

    if (event.request.headers) {
      const sensitiveHeaders = [
        "authorization",
        "cookie",
        "x-supabase-auth",
        "apikey",
      ];
      for (const header of sensitiveHeaders) {
        // Match case-insensitively
        const headerKey = Object.keys(event.request.headers).find(
          (k) => k.toLowerCase() === header.toLowerCase()
        );
        if (headerKey && event.request.headers[headerKey]) {
          event.request.headers[headerKey] = "[Redacted]";
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

  return event;
}

export function scrubEmailsFromString(str: string): string {
  return str.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[email]");
}

export function scrubTokensFromURL(url: string): string {
  try {
    const parsed = new URL(url);
    
    // Scrub sensitive query parameters
    const sensitiveParams = [
      "token",
      "access_token",
      "refresh_token",
      "apikey",
      "api_key",
      "auth",
      "code", // Supabase auth callback code
    ];
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "[Redacted]");
      }
    }
    
    // Remove hash entirely (Supabase puts tokens in #access_token=...)
    parsed.hash = "";
    
    return parsed.toString();
  } catch {
    return url;
  }
}

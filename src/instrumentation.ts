/**
 * Next.js instrumentation hook for server-side monitoring.
 * 
 * Loads Sentry configuration for Node.js and Edge runtimes.
 * Called once when the server starts.
 * 
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

import * as Sentry from "@sentry/nextjs";
import { scrubPII } from "@/lib/sentry/scrub";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const DSN = process.env.SENTRY_DSN;
    
    if (DSN) {
      Sentry.init({
        dsn: DSN,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
        release: process.env.VERCEL_GIT_COMMIT_SHA,
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
        
        beforeSend(event) {
          return scrubPII(event);
        },
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const DSN = process.env.SENTRY_DSN;
    
    if (DSN) {
      Sentry.init({
        dsn: DSN,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
        release: process.env.VERCEL_GIT_COMMIT_SHA,
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
        
        beforeSend(event) {
          return scrubPII(event);
        },
      });
    }
  }
}

/**
 * onRequestError hook - captures server-side errors from:
 * - Server Components
 * - Server Actions  
 * - API Route Handlers
 * - Middleware/Proxy
 */
export async function onRequestError(
  error: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
  }
) {
  Sentry.captureRequestError(error, request, context);
}

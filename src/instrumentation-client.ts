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
import { scrubPII } from "@/lib/sentry/scrub";

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

    beforeSend(event) {
      return scrubPII(event);
    },
  });
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

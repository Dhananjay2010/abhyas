import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Keep a recently fetched page in the client router cache.
     *
     * Next.js defaults `dynamic` to 0, which means a dynamically rendered
     * route is re-fetched from the server every single time it is navigated
     * to — including tapping back to a tab you were looking at five seconds
     * ago. For an app whose whole navigation model is four tabs, that is the
     * difference between switching tabs and reloading the app four times.
     *
     * Thirty seconds is safe here because every mutation calls
     * `revalidatePath` for the screens it affects, which purges these entries;
     * see `src/lib/revalidate.ts`. Nothing else writes this user's data.
     */
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

/**
 * Sentry build-time configuration.
 * 
 * Source maps are uploaded only when SENTRY_AUTH_TOKEN is set.
 * Without it, the build proceeds normally but source maps stay local.
 */
const sentryConfig = {
  // Suppress source map upload logs unless there's an error
  silent: true,

  // Upload source maps only when auth token is present
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,

  // For better error reporting, but don't fail the build if it goes wrong
  widenClientFileUpload: true,
  
  // Disable automatic instrumentation of Vercel Cron Jobs (not used in this app)
  automaticVercelMonitors: false,
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryConfig)
  : nextConfig;

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

  /**
   * Expose build version as a constant environment variable.
   * Evaluated once at build time, not per request.
   * Used by /api/version and version checking in the client.
   */
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? String(Date.now()),
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },

  /**
   * Allow YouTube thumbnail images for click-to-load video posters.
   * i.ytimg.com serves YouTube video thumbnails (hqdefault.jpg).
   * Used in src/components/youtube-embed.tsx.
   */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
    ],
  },
};

/**
 * Sentry build-time configuration.
 * 
 * Source maps are uploaded only when SENTRY_AUTH_TOKEN is set.
 * Without it, the build proceeds normally but source maps stay local.
 */
const sentryConfig = {
  // Organization and project for source map upload
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress source map upload logs unless there's an error
  silent: true,

  // Source maps configuration
  sourcemaps: {
    // Disable source map generation and upload when auth token not present
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // For better error reporting
  widenClientFileUpload: true,
  
  // Disable automatic instrumentation of Vercel Cron Jobs (not used in this app)
  automaticVercelMonitors: false,

  // Don't warn about missing onRouterTransitionStart (we have it)
  suppressOnRouterTransitionStartWarning: true,
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryConfig)
  : nextConfig;

import type { NextConfig } from "next";

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

export default nextConfig;

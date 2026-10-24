/**
 * Development-only timing helper for measuring server-side data loading.
 *
 * Enabled only when NEXT_PUBLIC_ENABLE_TIMING=true, and never logs user data.
 * Usage:
 *   const t = startTiming('route-name');
 *   // ... data loading
 *   t.end();
 */

const ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_ENABLE_TIMING === "true" &&
  process.env.NODE_ENV === "development";

type Timing = {
  end: () => void;
};

export function startTiming(label: string): Timing {
  if (!ENABLED) {
    return { end: () => {} };
  }

  const start = performance.now();
  return {
    end: () => {
      const duration = performance.now() - start;
      console.log(`[TIMING] ${label}: ${duration.toFixed(2)}ms`);
    },
  };
}

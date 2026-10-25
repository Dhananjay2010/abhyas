"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Live: turning the setting on mid-practice takes effect on the next frame. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

const never = () => () => {};

/**
 * A value only the browser can know, such as whether the device can vibrate,
 * read without a hydration mismatch: the server render and the first client
 * render both see `server`, and the real value follows.
 */
export function useClientValue<T extends string | number | boolean | null>(
  read: () => T,
  server: T,
): T {
  return useSyncExternalStore(never, read, () => server);
}

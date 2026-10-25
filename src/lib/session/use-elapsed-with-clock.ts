"use client";
import { useElapsed } from "@/lib/session/device";

/**
 * Wrapper around useElapsed that injects a custom clock function for testing.
 * This allows tests to control time without monkeypatching Date.now globally.
 * 
 * @param startedAtIso - ISO timestamp when the session started, or null
 * @param nowFn - Optional function that returns current time in ms (defaults to Date.now)
 * @returns Elapsed time in seconds
 */
export function useElapsedWithClock(
  startedAtIso: string | null,
  nowFn: () => number = Date.now
): number {
  return useElapsed(startedAtIso, nowFn);
}

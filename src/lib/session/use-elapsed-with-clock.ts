"use client";
import { useState, useEffect } from "react";

/**
 * Wrapper around elapsed time calculation that injects a custom clock function for testing.
 * This allows tests to control time without monkeypatching Date.now globally.
 * 
 * @param startedAtIso - ISO timestamp when the session started, or null
 * @param nowFn - Function that returns current time in ms (for testing)
 * @returns Elapsed time in seconds
 */
export function useElapsedWithClock(
  startedAtIso: string | null,
  nowFn: () => number
): number {
  const [start] = useState(() =>
    startedAtIso ? new Date(startedAtIso).getTime() : null,
  );
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!start) return;

    const updateElapsed = () => {
      const now = nowFn();
      const seconds = Math.floor((now - start) / 1000);
      setElapsed(seconds);
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [start, nowFn]);

  return elapsed;
}

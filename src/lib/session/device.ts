"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Device capabilities used during a guided session.
 *
 * These behave very differently across browsers, and iOS Safari is the strict
 * one that matters here:
 *   - Screen Wake Lock needs iOS 16.4+.
 *   - navigator.vibrate is NOT implemented in Safari at all, on any version.
 *   - Audio will not play until it has been unlocked inside a real user gesture.
 *
 * So nothing here is assumed to work. Each capability reports its real state,
 * and the session screen shows that state to the user -- if the timer is silent
 * on someone's phone, they can see why without opening a console.
 */

const noopSubscribe = () => () => {};

/**
 * Returns true after hydration completes, false during SSR.
 * Prevents hydration mismatches when reading browser APIs during render.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export type WakeLockState = {
  supported: boolean;
  active: boolean;
  error: string | null;
};

export function useWakeLock(enabled: boolean): WakeLockState {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const hydrated = useHydrated();
  const supported = hydrated && typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [state, setState] = useState<WakeLockState>({
    supported: false,
    active: false,
    error: null,
  });

  useEffect(() => {
    if (!supported || !enabled) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setState({ supported: true, active: true, error: null });
        sentinel.addEventListener("release", () => {
          setState((s) => ({ ...s, active: false }));
        });
      } catch (e) {
        setState({
          supported: true,
          active: false,
          error: e instanceof Error ? e.message : "Wake lock refused",
        });
      }
    }

    void acquire();

    // The lock is dropped whenever the tab is hidden, so re-acquire on return.
    function onVisibility() {
      if (document.visibilityState === "visible" && !sentinelRef.current?.released) return;
      if (document.visibilityState === "visible") void acquire();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [enabled, supported]);

  return { ...state, supported };
}

export type Beeper = {
  unlock: () => void;
  beep: () => void;
  unlocked: boolean;
};

/**
 * A short tone for the end of a rest period.
 *
 * Built on WebAudio rather than an audio file: no asset to ship, and no
 * autoplay policy to fight once the context has been resumed inside a gesture.
 */
export function useBeeper(enabled: boolean): Beeper {
  const ctxRef = useRef<AudioContext | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  const unlock = useCallback(() => {
    if (!enabled || ctxRef.current) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      void ctx.resume();
      ctxRef.current = ctx;
      setUnlocked(true);
    } catch {
      setUnlocked(false);
    }
  }, [enabled]);

  const beep = useCallback(() => {
    const ctx = ctxRef.current;
    if (!enabled || !ctx) return;
    try {
      // Two short rising notes -- audible over gym noise without being harsh.
      [0, 0.18].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = i === 0 ? 660 : 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.18);
      });
    } catch {
      /* nothing useful to do if the context died */
    }
  }, [enabled]);

  return { unlock, beep, unlocked };
}

export const vibrationSupported = () =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export function vibrate(pattern: number | number[]) {
  if (vibrationSupported()) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Calculate elapsed seconds from start to now, clamped at 0.
 * Pure function for testability.
 */
export function elapsedSeconds(startMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

/**
 * Return frozen elapsed if set, otherwise calculate elapsed from startMs to nowMs.
 * Pure helper for stop() logic.
 */
export function freezeElapsed(frozen: number | null, startMs: number, nowMs: number): number {
  return frozen ?? elapsedSeconds(startMs, nowMs);
}

export type ElapsedState = {
  elapsed: number;
  stop: () => number;
  resume: () => void;
};

/**
 * Counts elapsed seconds, resilient to the tab being backgrounded.
 *
 * Starts from null to avoid hydration mismatches (React error #418).
 * Renders a stable placeholder derived from started_at until the first tick.
 */
export function useElapsed(startedAtIso: string | null): ElapsedState {
  const [start] = useState(() =>
    startedAtIso ? new Date(startedAtIso).getTime() : Date.now(),
  );
  const [now, setNow] = useState<number | null>(null);
  const [stopped, setStopped] = useState(false);
  const [frozenElapsed, setFrozenElapsed] = useState<number | null>(null);
  const frozenSecondsRef = useRef<number | null>(null);

  useEffect(() => {
    if (stopped) return;
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [stopped]);

  const elapsed =
    stopped && frozenElapsed !== null
      ? frozenElapsed
      : now !== null
        ? elapsedSeconds(start, now)
        : 0;

  const stop = useCallback(() => {
    if (frozenSecondsRef.current === null) {
      const finalElapsed = freezeElapsed(frozenSecondsRef.current, start, Date.now());
      frozenSecondsRef.current = finalElapsed;
      setFrozenElapsed(finalElapsed);
      setStopped(true);
    }
    return frozenSecondsRef.current ?? 0;
  }, [start]);

  const resume = useCallback(() => {
    setStopped(false);
    setFrozenElapsed(null);
    frozenSecondsRef.current = null;
  }, []);

  return { elapsed, stop, resume };
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Cap displayed elapsed time for stale sessions.
 * Stale sessions (past-day or >3h idle) should never show >= 180:00 on the clock.
 * Returns the elapsed time capped at 179:59 (3 hours - 1 second).
 */
export function displayElapsed(elapsed: number, stale: boolean): number {
  const THREE_HOURS_SECONDS = 3 * 60 * 60;
  if (stale && elapsed >= THREE_HOURS_SECONDS) {
    return THREE_HOURS_SECONDS - 1;
  }
  return elapsed;
}

/**
 * Get the display elapsed time for the runner's clock, accounting for stale sessions.
 * 
 * @param elapsed - Raw elapsed seconds from useElapsed
 * @param startedAt - ISO timestamp when session started
 * @param timezone - Member's timezone for stale detection
 * @returns Elapsed seconds to display (capped for stale sessions)
 */
export function getRunnerClockElapsed(
  elapsed: number,
  startedAt: string | null,
  timezone: string,
): number {
  if (!startedAt) return elapsed;
  
  // Use lazy import to handle "use client" context
  const { isStaleSession } = require("./is-stale-session") as { 
    isStaleSession: (args: { startedAt: string; now: string; timezone: string }) => boolean 
  };
  
  const stale = isStaleSession({
    startedAt,
    now: new Date().toISOString(),
    timezone,
  });
  
  return displayElapsed(elapsed, stale);
}

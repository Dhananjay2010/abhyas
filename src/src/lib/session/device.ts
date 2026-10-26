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

export type WakeLockState = {
  supported: boolean;
  active: boolean;
  error: string | null;
};

export const wakeLockSupported = () =>
  typeof navigator !== "undefined" && "wakeLock" in navigator;

/**
 * Hook to check wake lock support with SSR-safe hydration.
 * Returns false during SSR, then the actual support on the client.
 * Uses useSyncExternalStore to avoid hydration mismatches.
 */
export function useWakeLockSupported(): boolean {
  return useSyncExternalStore(
    useCallback(() => () => {}, []), // subscribe (no-op, capability doesn't change)
    () => wakeLockSupported(), // getSnapshot (client)
    () => false, // getServerSnapshot (SSR) - returns false so server HTML matches initial client render
  );
}

export function useWakeLock(enabled: boolean): WakeLockState {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const supported = useWakeLockSupported();
  const [activeState, setActiveState] = useState<{ active: boolean; error: string | null }>(() => ({
    active: false,
    error: null,
  }));

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
        setActiveState({ active: true, error: null });
        sentinel.addEventListener("release", () => {
          setActiveState((s) => ({ ...s, active: false }));
        });
      } catch (e) {
        setActiveState({
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

  return {
    supported,
    active: activeState.active,
    error: activeState.error,
  };
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

/**
 * Hook to check vibration support with SSR-safe hydration.
 * Returns false during SSR, then the actual support on the client.
 * Uses useSyncExternalStore to avoid hydration mismatches.
 */
export function useVibrationSupported(): boolean {
  return useSyncExternalStore(
    useCallback(() => () => {}, []), // subscribe (no-op, capability doesn't change)
    () => vibrationSupported(), // getSnapshot (client)
    () => false, // getServerSnapshot (SSR) - returns false so server HTML matches initial client render
  );
}

export function vibrate(pattern: number | number[]) {
  if (vibrationSupported()) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}

/** Counts elapsed seconds, resilient to the tab being backgrounded. */
export function useElapsed(startedAtIso: string | null): number {
  const [start] = useState(() =>
    startedAtIso ? new Date(startedAtIso).getTime() : null,
  );
  
  // Use useSyncExternalStore to subscribe to time (an external system)
  // Returns 0 during SSR (getServerSnapshot)
  const now = useSyncExternalStore(
    useCallback((onStoreChange: () => void) => {
      // Subscribe to time updates every second
      const interval = setInterval(onStoreChange, 1000);
      return () => clearInterval(interval);
    }, []),
    // Whole seconds, so consecutive reads within a second are equal: React
    // requires getSnapshot to return the same value until the store changes,
    // and a raw Date.now() would differ on every read.
    () => Math.floor(Date.now() / 1000) * 1000, // getSnapshot (client)
    () => 0, // getServerSnapshot (SSR) - returns 0 so elapsed will be 0
  );

  // Return 0 during SSR and when there's no start time
  if (start === null) return 0;
  
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export function useWakeLock(enabled: boolean): WakeLockState {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  // Derived at first render rather than in an effect: it never changes.
  const [state, setState] = useState<WakeLockState>(() => ({
    supported: typeof navigator !== "undefined" && "wakeLock" in navigator,
    active: false,
    error: null,
  }));
  const supported = state.supported;

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

  return state;
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

/** Counts elapsed seconds, resilient to the tab being backgrounded. */
export function useElapsed(startedAtIso: string | null): number {
  const [start] = useState(() =>
    startedAtIso ? new Date(startedAtIso).getTime() : null,
  );
  
  // Initial state is null to defer clock-dependent rendering until after hydration.
  // Server render and client hydration both see null; the clock starts in the effect.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Set the initial time after mount (client-only), scheduled asynchronously
    const initial = setTimeout(() => setNow(Date.now()), 0);
    
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(t);
    };
  }, []);

  // Return 0 during SSR and before the first effect runs (hydration-safe)
  if (now === null || start === null) return 0;
  
  return Math.max(0, Math.floor((now - start) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

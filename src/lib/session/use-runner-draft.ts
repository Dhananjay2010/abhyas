import { useEffect, useMemo, useRef, useState } from "react";
import {
  parse,
  serialize,
  remainingRestMs,
  draftFor,
  clearRest as clearRestPersisted,
  clearDraft as clearDraftPersisted,
  clearAll,
  type RunnerDraftState,
} from "./runner-draft";

export type DraftRestore = {
  /** Remaining rest time in milliseconds (0 if expired or none). */
  remainingRestMs: number;
  /** The exercise ID the rest belongs to. */
  restExerciseId: string | null;
  /** Draft inputs for the current exercise and set, or null if none. */
  draft: { reps: string; weight: string; seconds?: string } | null;
};

/**
 * Hook to persist and restore session runner state across page reloads.
 * 
 * Call this hook once at the top of SessionRunner. It:
 * - Loads saved state on mount
 * - Writes rest countdown when it starts
 * - Writes draft inputs on change (debounced)
 * - Clears draft when a set is logged
 * - Clears rest when it's skipped or ends
 * - Clears all state when the session finishes or is abandoned
 */
export function useRunnerDraft(
  userId: string,
  sessionId: string,
  currentExerciseId: string | undefined,
  currentSetNumber: number,
): {
  /** Restored state on mount, or null if nothing was saved. */
  restore: DraftRestore | null;
  /** Call when rest timer starts. */
  onRestStart: (durationSeconds: number, exerciseId: string) => void;
  /** Call when rest is skipped or ends naturally. */
  onRestEnd: () => void;
  /** Call when inputs change (debounced internally). */
  onDraftChange: (reps: string, weight: string, seconds?: string) => void;
  /** Call when a set is logged. */
  onSetLogged: () => void;
  /** Call when the session finishes or is abandoned. */
  onSessionEnd: () => void;
} {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load localStorage once on mount using lazy initializer.
  // Capture both state and mount time together.
  const [mountData] = useState<{
    state: RunnerDraftState | null;
    mountTime: number;
  }>(() => {
    if (typeof window === "undefined")
      return { state: null, mountTime: 0 };
    return {
      state: parse(userId, sessionId),
      mountTime: Date.now(),
    };
  });

  // Derive restore data from cached state and current context.
  const restore: DraftRestore | null = useMemo(() => {
    if (!mountData.state) return null;
    const remaining = remainingRestMs(mountData.state, mountData.mountTime);
    const draft =
      currentExerciseId !== undefined
        ? draftFor(mountData.state, currentExerciseId, currentSetNumber)
        : null;
    return {
      remainingRestMs: remaining,
      restExerciseId: mountData.state.restExerciseId,
      draft,
    };
  }, [mountData, currentExerciseId, currentSetNumber]);

  const onRestStart = (durationSeconds: number, exerciseId: string) => {
    if (typeof window === "undefined") return;
    const restEndsAt = Date.now() + durationSeconds * 1000;
    const existing = parse(userId, sessionId);
    serialize(userId, sessionId, {
      restEndsAt,
      restExerciseId: exerciseId,
      draft: existing?.draft ?? null,
    });
  };

  const onRestEnd = () => {
    if (typeof window === "undefined") return;
    clearRestPersisted(userId, sessionId);
  };

  const onDraftChange = (reps: string, weight: string, seconds?: string) => {
    if (typeof window === "undefined") return;
    if (!currentExerciseId) return;

    // Debounce: wait 300ms after the last change before writing.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const existing = parse(userId, sessionId);
      serialize(userId, sessionId, {
        restEndsAt: existing?.restEndsAt ?? null,
        restExerciseId: existing?.restExerciseId ?? null,
        draft: {
          sessionExerciseId: currentExerciseId,
          setNumber: currentSetNumber,
          reps,
          weight,
          seconds,
        },
      });
    }, 300);
  };

  const onSetLogged = () => {
    if (typeof window === "undefined") return;
    clearDraftPersisted(userId, sessionId);
  };

  const onSessionEnd = () => {
    if (typeof window === "undefined") return;
    clearAll(userId, sessionId);
  };

  // Cleanup debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    restore,
    onRestStart,
    onRestEnd,
    onDraftChange,
    onSetLogged,
    onSessionEnd,
  };
}

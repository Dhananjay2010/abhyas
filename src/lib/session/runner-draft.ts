/**
 * Session runner draft persistence.
 * 
 * Stores rest countdown state and typed-but-unlogged set inputs so they survive
 * page reloads, app backgrounding, and error-boundary retries.
 */

export type RunnerDraftState = {
  /** Schema version for breaking changes. */
  v: 1;
  /** Epoch milliseconds when the rest timer expires, or null when no rest is active. */
  restEndsAt: number | null;
  /** Which exercise the rest belongs to (checked before restoring). */
  restExerciseId: string | null;
  /** Typed but unlogged set inputs. */
  draft: {
    sessionExerciseId: string;
    setNumber: number;
    /** String to preserve leading zeros and partial decimal input during typing. */
    reps: string;
    /** String to preserve leading zeros and partial decimal input during typing. */
    weight: string;
    /** String for timed exercises (holds). */
    seconds?: string;
  } | null;
  /** Timestamp for staleness detection and clock-skew handling. */
  savedAt: number;
};

/**
 * Generate the localStorage key for a user's session runner draft.
 * 
 * The key includes userId so drafts are never shared across accounts on
 * shared devices, and sessionId so concurrent sessions don't collide.
 */
function storageKey(userId: string, sessionId: string): string {
  return `abhyas:runner:${userId}:${sessionId}`;
}

/**
 * Serialize a runner draft to localStorage.
 * 
 * @returns true if written, false if localStorage is unavailable or full.
 */
export function serialize(
  userId: string,
  sessionId: string,
  state: Omit<RunnerDraftState, "v" | "savedAt">,
): boolean {
  try {
    const full: RunnerDraftState = {
      v: 1,
      ...state,
      savedAt: Date.now(),
    };
    localStorage.setItem(storageKey(userId, sessionId), JSON.stringify(full));
    return true;
  } catch {
    // localStorage may be unavailable (private mode, SSR) or full (quota).
    return false;
  }
}

/**
 * Parse a runner draft from localStorage.
 * 
 * @returns The stored state, or null if the key is missing, invalid, or for a different user/session.
 */
export function parse(userId: string, sessionId: string): RunnerDraftState | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, sessionId));
    if (!raw) return null;
    
    const obj = JSON.parse(raw);
    
    // Reject wrong version or malformed data.
    if (typeof obj !== "object" || obj === null || obj.v !== 1) return null;
    if (typeof obj.savedAt !== "number") return null;
    if (obj.restEndsAt !== null && typeof obj.restEndsAt !== "number") return null;
    if (obj.restExerciseId !== null && typeof obj.restExerciseId !== "string") return null;
    
    if (obj.draft !== null) {
      if (typeof obj.draft !== "object") return null;
      if (typeof obj.draft.sessionExerciseId !== "string") return null;
      if (typeof obj.draft.setNumber !== "number") return null;
      if (typeof obj.draft.reps !== "string") return null;
      if (typeof obj.draft.weight !== "string") return null;
      if (obj.draft.seconds !== undefined && typeof obj.draft.seconds !== "string") return null;
    }
    
    return obj as RunnerDraftState;
  } catch {
    return null;
  }
}

/**
 * Calculate remaining rest time in milliseconds, clamped at 0.
 * 
 * Handles clock skew (where now < savedAt) by treating negative elapsed time as zero.
 * Returns 0 when rest has expired or no rest is active.
 */
export function remainingRestMs(state: RunnerDraftState | null, now: number): number {
  if (!state || state.restEndsAt === null) return 0;
  const remaining = state.restEndsAt - now;
  return Math.max(0, remaining);
}

/**
 * Retrieve the draft for the current exercise and set.
 * 
 * Only restores if the stored draft matches the requested exercise and set number.
 * Returns null if no matching draft exists or if the draft is for a different context.
 */
export function draftFor(
  state: RunnerDraftState | null,
  sessionExerciseId: string,
  setNumber: number,
): { reps: string; weight: string; seconds?: string } | null {
  if (!state || !state.draft) return null;
  if (state.draft.sessionExerciseId !== sessionExerciseId) return null;
  if (state.draft.setNumber !== setNumber) return null;
  return {
    reps: state.draft.reps,
    weight: state.draft.weight,
    seconds: state.draft.seconds,
  };
}

/**
 * Clear rest state from localStorage.
 */
export function clearRest(userId: string, sessionId: string): void {
  try {
    const existing = parse(userId, sessionId);
    if (!existing) return;
    serialize(userId, sessionId, {
      restEndsAt: null,
      restExerciseId: null,
      draft: existing.draft,
    });
  } catch {
    // Ignore failures (localStorage unavailable or full).
  }
}

/**
 * Clear draft inputs from localStorage.
 */
export function clearDraft(userId: string, sessionId: string): void {
  try {
    const existing = parse(userId, sessionId);
    if (!existing) return;
    serialize(userId, sessionId, {
      restEndsAt: existing.restEndsAt,
      restExerciseId: existing.restExerciseId,
      draft: null,
    });
  } catch {
    // Ignore failures.
  }
}

/**
 * Clear all runner state for this session.
 */
export function clearAll(userId: string, sessionId: string): void {
  try {
    localStorage.removeItem(storageKey(userId, sessionId));
  } catch {
    // Ignore failures.
  }
}

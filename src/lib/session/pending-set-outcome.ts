import type { PendingSetDeps } from "./pending-set-deps";
import type { PendingSet, Storage } from "./pending-set-retry";
import { clearPendingSet, isDuplicateError } from "./pending-set-retry";
import { isSessionExpired } from "../auth/session-expired";

/**
 * Outcome of attempting to save a pending set.
 */
export type PendingSetOutcome =
  | { status: "saved" }  // Successfully saved or duplicate
  | { status: "expired" }  // Session expired
  | { status: "closed" }  // Session ended/no longer in progress
  | { status: "failed"; error: string };  // Network or other error

/**
 * Shared per-set outcome handler used by runner, sign-out replay, and sign-in replay.
 * 
 * Attempts to save one pending set and returns the outcome.
 * On success or duplicate, clears the set from storage.
 * On session expired, keeps the set (caller decides policy).
 * On closed session, keeps the set (for keep-and-surface policy).
 * On network error, keeps the set for retry.
 */
export async function attemptPendingSet({
  set,
  userId,
  sessionId,
  storage,
  deps,
  logSet,
  sessionStatus,
}: {
  set: PendingSet;
  userId: string;
  sessionId: string;
  storage: Storage;
  deps: PendingSetDeps;
  logSet: (params: {
    sessionExerciseId: string;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
  }) => Promise<{ ok: true } | { ok: false; error: string; code?: string } | { ok: false; reason: "set_exists" }>;
  sessionStatus?: "in-progress" | "ended" | "stale";
}): Promise<PendingSetOutcome> {
  // Check if session is no longer in progress (closed)
  if (sessionStatus && sessionStatus !== "in-progress") {
    // Don't clear - caller will surface with "workout ended" message
    return { status: "closed" };
  }

  try {
    const result = await logSet({
      sessionExerciseId: set.sessionExerciseId,
      setNumber: set.setNumber,
      reps: set.reps,
      weightKg: set.weightKg,
      durationSeconds: set.durationSeconds,
    });

    if (result.ok) {
      // Success - clear the set
      clearPendingSet(storage, userId, sessionId, set.clientId, deps);
      return { status: "saved" };
    }

    // Check for session expired
    if (isSessionExpired(result)) {
      // Don't clear - let caller handle expired sets
      return { status: "expired" };
    }

    // Check for duplicate (either via reason field or code)
    if (("reason" in result && result.reason === "set_exists") || isDuplicateError(result)) {
      // Duplicate is success - clear the set
      clearPendingSet(storage, userId, sessionId, set.clientId, deps);
      return { status: "saved" };
    }

    // Other failure - keep pending
    const errorMessage = "error" in result ? result.error : "Failed to save set";
    return { status: "failed", error: errorMessage };

  } catch (err) {
    // Check if error is session expired
    if (isSessionExpired(err)) {
      // Don't clear - let caller handle expired sets
      return { status: "expired" };
    }

    // Network or other error - keep pending
    const message = err instanceof Error ? err.message : "Network error";
    return { status: "failed", error: message };
  }
}

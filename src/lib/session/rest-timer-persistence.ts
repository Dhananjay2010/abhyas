/**
 * Rest timer persistence using sessionStorage
 *
 * Pure functions with injected storage and clock, so they can be tested without
 * sleeps or real browsers.
 */

import { useMemo, useEffect, useRef } from "react";

export type StorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type RestRecord = {
  sessionId: string;
  sessionExerciseId: string;
  restEndsAt: number;
};

/**
 * No-op storage for when sessionStorage is unavailable (SSR, private mode).
 * Hoisted to module scope so it's stable across renders.
 */
const NO_OP_STORAGE: StorageAdapter = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/**
 * Get sessionStorage with SecurityError handling.
 * Some browsers throw when storage is disabled or in private mode.
 */
function getSessionStorage(): StorageAdapter {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // SecurityError or blocked storage
  }
  return NO_OP_STORAGE;
}

/**
 * Type guard for RestRecord - validates all fields.
 */
function isRestRecord(value: unknown): value is RestRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "sessionId" in value &&
    typeof (value as Record<string, unknown>).sessionId === "string" &&
    "sessionExerciseId" in value &&
    typeof (value as Record<string, unknown>).sessionExerciseId === "string" &&
    "restEndsAt" in value &&
    typeof (value as Record<string, unknown>).restEndsAt === "number"
  );
}

/**
 * Build the storage key for a session's rest timer.
 *
 * Scoped by session id so different sessions don't collide, and prefixed so
 * it's clear what it is.
 */
function restKey(sessionId: string): string {
  return `abhyas:rest:${sessionId}`;
}

/**
 * Save a rest timer to storage.
 *
 * Called when startRest sets restEndsAt. If storage throws or is unavailable
 * (private mode), does nothing rather than crashing.
 */
export function saveRest(storage: StorageAdapter, record: RestRecord): void {
  try {
    const key = restKey(record.sessionId);
    const value = JSON.stringify(record);
    storage.setItem(key, value);
  } catch {
    // Private mode or quota exceeded: behave as if storage doesn't exist
  }
}

/**
 * Load a rest timer from storage.
 *
 * Returns the record only if:
 * - The JSON is valid and passes type guard
 * - restEndsAt is in the future (relative to now())
 * - restEndsAt is within 15 minutes (guards against garbage/hand-edited values)
 * - The session id matches
 *
 * Otherwise removes the key and returns null. If storage throws, returns null
 * without throwing.
 */
export function loadRest(
  storage: StorageAdapter,
  sessionId: string,
  now: () => number,
): RestRecord | null {
  try {
    const key = restKey(sessionId);
    const value = storage.getItem(key);
    if (value === null) return null;

    const parsed: unknown = JSON.parse(value);
    
    // Type guard: validate all fields
    if (!isRestRecord(parsed)) {
      storage.removeItem(key);
      return null;
    }

    const currentTime = now();
    const MAX_REST_DURATION = 15 * 60 * 1000; // 15 minutes in ms

    // Valid only if it's for this session, hasn't expired, and is within reasonable bounds
    if (
      parsed.sessionId === sessionId &&
      parsed.restEndsAt > currentTime &&
      parsed.restEndsAt <= currentTime + MAX_REST_DURATION
    ) {
      return parsed;
    }

    // Expired, wrong session, or unreasonable value: clean up
    storage.removeItem(key);
    return null;
  } catch {
    // Corrupt JSON or storage unavailable: remove and return null
    try {
      storage.removeItem(restKey(sessionId));
    } catch {
      // Ignore removal errors
    }
    return null;
  }
}

/**
 * Clear the rest timer from storage.
 *
 * Called when the rest is skipped, undone, or the exercise changes. If storage
 * throws, does nothing.
 */
export function clearRest(storage: StorageAdapter, sessionId: string): void {
  try {
    storage.removeItem(restKey(sessionId));
  } catch {
    // Storage unavailable: nothing to do
  }
}

/**
 * React hook for rest persistence.
 *
 * Returns callbacks to save/clear the rest timer, plus manages restoration
 * via an onRestore callback that runs in an effect (satisfying lint rules).
 *
 * The returned object is stable (memoized) so it doesn't cause useCallback
 * dependencies to change on every render.
 */
export function useRestPersistence(
  sessionId: string,
  currentSessionExerciseId: string | undefined,
  onRestore: (restEndsAt: number) => void,
  now: () => number = Date.now,
) {
  const storage = getSessionStorage();
  const hasRestoredRef = useRef(false);

  // Restore on mount if a valid rest exists for the current exercise
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    
    const record = loadRest(storage, sessionId, now);
    if (record && record.sessionExerciseId === currentSessionExerciseId) {
      onRestore(record.restEndsAt);
    } else if (record) {
      // Wrong exercise: clear it
      clearRest(storage, sessionId);
    }
  }, [sessionId, currentSessionExerciseId, storage, now, onRestore]);

  return useMemo(() => ({
    save: (sessionExerciseId: string, restEndsAt: number) => {
      saveRest(storage, { sessionId, sessionExerciseId, restEndsAt });
    },
    clear: () => {
      clearRest(storage, sessionId);
    },
  }), [sessionId, storage]);
}

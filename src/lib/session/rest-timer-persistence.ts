/**
 * Rest timer persistence using sessionStorage
 *
 * Pure functions with injected storage and clock, so they can be tested without
 * sleeps or real browsers.
 */

export type StorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type RestRecord = {
  sessionId: string;
  sessionExerciseId: string;
  setNumber: number;
  restEndsAt: number;
};

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
 * - The JSON is valid
 * - restEndsAt is in the future (relative to now())
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

    const parsed = JSON.parse(value) as RestRecord;

    // Valid only if it's for this session and hasn't expired
    if (
      parsed.sessionId === sessionId &&
      typeof parsed.restEndsAt === "number" &&
      parsed.restEndsAt > now()
    ) {
      return parsed;
    }

    // Expired or wrong session: clean up
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
 * Returns callbacks to save/load/clear the rest timer. Called once on mount to
 * restore a rest in progress, and whenever the rest state changes.
 */
export function useRestPersistence(
  sessionId: string,
  currentSessionExerciseId: string | undefined,
  storage: StorageAdapter = typeof sessionStorage !== "undefined" ? sessionStorage : {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  now: () => number = Date.now,
) {
  return {
    save: (sessionExerciseId: string, setNumber: number, restEndsAt: number) => {
      saveRest(storage, { sessionId, sessionExerciseId, setNumber, restEndsAt });
    },
    load: () => {
      const record = loadRest(storage, sessionId, now);
      // Only restore if it's for the current exercise
      if (record && record.sessionExerciseId === currentSessionExerciseId) {
        return record.restEndsAt;
      }
      // Wrong exercise or expired: clear it
      if (record) {
        clearRest(storage, sessionId);
      }
      return null;
    },
    clear: () => {
      clearRest(storage, sessionId);
    },
  };
}

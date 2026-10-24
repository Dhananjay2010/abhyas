/**
 * Session snapshot cache for offline resilience.
 * 
 * Pure functions for reading/writing/merging session snapshots with versioning
 * and corrupt-data protection.
 */

const CACHE_VERSION = 1;

export interface SessionSnapshot {
  version: number;
  sessionId: string;
  userId: string;
  exercises: Array<{
    id: string;
    exerciseId: string;
    name: string;
    plannedSets: number;
    sets: Array<{
      setNumber: number;
      reps: number | null;
      weightKg: number | null;
      durationSeconds: number | null;
      pending?: boolean;
      failed?: boolean;
      unsaved?: boolean;
      clientId?: string;
    }>;
  }>;
  elapsed: number;
  createdAt: number;
}

export interface SessionCacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getCacheKey(sessionId: string): string {
  return `abhyas:session:${sessionId}`;
}

/**
 * Write a session snapshot to storage.
 * Versioned and keyed by session ID.
 */
export function writeSessionSnapshot(
  storage: SessionCacheStorage,
  snapshot: Omit<SessionSnapshot, "version" | "createdAt">
): void {
  try {
    const versionedSnapshot: SessionSnapshot = {
      ...snapshot,
      version: CACHE_VERSION,
      createdAt: Date.now(),
    };
    const key = getCacheKey(snapshot.sessionId);
    storage.setItem(key, JSON.stringify(versionedSnapshot));
  } catch {
    // Quota exceeded or storage unavailable, fail silently
  }
}

/**
 * Read a session snapshot from storage.
 * Returns null if not found, corrupt, or version mismatch.
 */
export function readSessionSnapshot(
  storage: SessionCacheStorage,
  sessionId: string
): SessionSnapshot | null {
  try {
    const key = getCacheKey(sessionId);
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    
    // Version check
    if (parsed.version !== CACHE_VERSION) {
      return null;
    }

    // Basic structure validation
    if (
      !parsed.sessionId ||
      !parsed.userId ||
      !Array.isArray(parsed.exercises) ||
      typeof parsed.elapsed !== "number"
    ) {
      return null;
    }

    return parsed as SessionSnapshot;
  } catch {
    // Corrupt JSON or read error
    return null;
  }
}

/**
 * Merge a snapshot with queued sets from the outbox.
 * Avoids duplicates: queued sets override snapshot sets by setNumber.
 */
export function mergeSnapshotWithOutbox(
  snapshot: SessionSnapshot,
  queuedSets: Array<{
    sessionExerciseId: string;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
    pending?: boolean;
    failed?: boolean;
    clientId?: string;
  }>
): SessionSnapshot {
  // Group queued sets by exercise ID
  const queuedByExercise = new Map<string, typeof queuedSets>();
  for (const set of queuedSets) {
    const existing = queuedByExercise.get(set.sessionExerciseId) ?? [];
    existing.push(set);
    queuedByExercise.set(set.sessionExerciseId, existing);
  }

  return {
    ...snapshot,
    exercises: snapshot.exercises.map((ex) => {
      const queuedForEx = queuedByExercise.get(ex.id) ?? [];
      if (queuedForEx.length === 0) return ex;

      // Merge: queued sets override by setNumber
      const queuedBySetNumber = new Map(
        queuedForEx.map((s) => [s.setNumber, s])
      );

      const mergedSets = [...ex.sets];
      
      // Update existing sets with queued data
      for (let i = 0; i < mergedSets.length; i++) {
        const queued = queuedBySetNumber.get(mergedSets[i].setNumber);
        if (queued) {
          mergedSets[i] = { ...queued };
          queuedBySetNumber.delete(queued.setNumber);
        }
      }

      // Add new queued sets
      for (const queued of queuedBySetNumber.values()) {
        mergedSets.push({ ...queued });
      }

      mergedSets.sort((a, b) => a.setNumber - b.setNumber);

      return { ...ex, sets: mergedSets };
    }),
  };
}

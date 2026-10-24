/**
 * Load session from cached snapshot when server data unavailable.
 * 
 * Reads snapshot from localStorage and merges with queued outbox sets.
 * Returns null if no cached data found.
 */

import { readSessionSnapshot, mergeSnapshotWithOutbox, type SessionCacheStorage } from "./session-cache";

export interface CachedSessionData {
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
}

export function loadCachedSession(
  storage: SessionCacheStorage,
  sessionId: string,
  userId: string
): CachedSessionData | null {
  // Read snapshot
  const snapshot = readSessionSnapshot(storage, sessionId);
  if (!snapshot) return null;

  // Get queued sets from outbox
  const outboxKey = `abhyas:outbox:${userId}:${sessionId}`;
  const outboxRaw = storage.getItem(outboxKey);
  const queuedSets = outboxRaw ? JSON.parse(outboxRaw).pending || [] : [];

  // Merge snapshot with queued sets
  const merged = mergeSnapshotWithOutbox(snapshot, queuedSets);

  return {
    exercises: merged.exercises,
    elapsed: merged.elapsed,
  };
}

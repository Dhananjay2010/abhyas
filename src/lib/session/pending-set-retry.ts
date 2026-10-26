/**
 * Pending set retry logic for session expiry.
 * 
 * Keeps sets that failed to save due to session expiration, persists them across
 * sign-in redirect in localStorage, and replays ALL pending sets once when the
 * user returns authenticated. Treats 23505 unique violations as success to prevent
 * double-saves.
 */

import type { PendingSetDeps } from "./pending-set-deps";

export type PendingSet = {
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  /** Client-generated idempotency key to detect duplicate saves. */
  clientId: string;
};

type PendingSets = {
  [sessionId: string]: PendingSet[];
};

type PendingSetsWithTimestamp = {
  [sessionId: string]: {
    sets: PendingSet[];
    timestamp: number;
  };
};

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * Generate a storage key for pending sets keyed by user ID.
 */
export function storageKey(userId: string): string {
  return `pending-sets:${userId}`;
}

/**
 * Type guard to check if value is a record object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate that a value is a well-formed PendingSet.
 */
function isValidPendingSet(value: unknown): value is PendingSet {
  if (!isRecord(value)) return false;
  
  return (
    typeof value.sessionExerciseId === 'string' &&
    typeof value.setNumber === 'number' &&
    (value.reps === null || typeof value.reps === 'number') &&
    (value.weightKg === null || typeof value.weightKg === 'number') &&
    (value.durationSeconds === null || typeof value.durationSeconds === 'number') &&
    typeof value.clientId === 'string'
  );
}

/**
 * Validate that a value is a plain object of arrays of well-formed PendingSets.
 */
function isValidPendingSets(value: unknown): value is PendingSets {
  if (!isRecord(value)) {
    return false;
  }
  
  for (const key in value) {
    const entry = value[key];
    if (!Array.isArray(entry)) return false;
    for (const set of entry) {
      if (!isValidPendingSet(set)) return false;
    }
  }
  
  return true;
}

/**
 * Validate timestamped format.
 */
function isValidTimestampedSets(value: unknown): value is PendingSetsWithTimestamp {
  if (!isRecord(value)) {
    return false;
  }
  
  for (const key in value) {
    const entry = value[key];
    if (!isRecord(entry)) {
      return false;
    }
    if (!Array.isArray(entry.sets) || typeof entry.timestamp !== 'number') {
      return false;
    }
    for (const set of entry.sets) {
      if (!isValidPendingSet(set)) return false;
    }
  }
  
  return true;
}

/**
 * Prune stale entries older than STALE_THRESHOLD_MS.
 */
function pruneStaleEntries(data: PendingSetsWithTimestamp, now: number): PendingSetsWithTimestamp {
  const pruned: PendingSetsWithTimestamp = {};
  
  for (const sessionId in data) {
    const entry = data[sessionId];
    if (entry && now - entry.timestamp < STALE_THRESHOLD_MS) {
      pruned[sessionId] = entry;
    }
  }
  
  return pruned;
}

/**
 * Load all pending sets from storage with pruning.
 */
function loadAllPendingSetsWithTimestamp(storage: Storage, userId: string, deps: PendingSetDeps): PendingSetsWithTimestamp {
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    
    if (isValidTimestampedSets(parsed)) {
      const pruned = pruneStaleEntries(parsed, deps.now());
      if (Object.keys(pruned).length === 0) {
        storage.removeItem(storageKey(userId));
      } else if (Object.keys(pruned).length < Object.keys(parsed).length) {
        storage.setItem(storageKey(userId), JSON.stringify(pruned));
      }
      return pruned;
    }
    
    if (isValidPendingSets(parsed)) {
      const now = deps.now();
      const timestamped: PendingSetsWithTimestamp = {};
      for (const sessionId in parsed) {
        timestamped[sessionId] = {
          sets: parsed[sessionId],
          timestamp: now,
        };
      }
      storage.setItem(storageKey(userId), JSON.stringify(timestamped));
      return timestamped;
    }
    
    storage.removeItem(storageKey(userId));
    return {};
  } catch {
    storage.removeItem(storageKey(userId));
    return {};
  }
}

/**
 * Load all pending sets from storage.
 */
export function loadAllPendingSets(storage: Storage, userId: string, deps: PendingSetDeps): PendingSets {
  const timestamped = loadAllPendingSetsWithTimestamp(storage, userId, deps);
  const result: PendingSets = {};
  
  for (const sessionId in timestamped) {
    result[sessionId] = timestamped[sessionId].sets;
  }
  
  return result;
}

/**
 * Load pending sets for a specific session.
 */
export function loadPendingSets(
  storage: Storage,
  userId: string,
  sessionId: string,
  deps: PendingSetDeps
): PendingSet[] {
  const all = loadAllPendingSets(storage, userId, deps);
  return all[sessionId] ?? [];
}

/**
 * Save a pending set to storage (adds to the list for this session).
 */
export function savePendingSet(
  storage: Storage,
  userId: string,
  sessionId: string,
  pending: PendingSet,
  deps: PendingSetDeps
): void {
  const all = loadAllPendingSetsWithTimestamp(storage, userId, deps);
  const existing = all[sessionId]?.sets ?? [];
  
  const alreadySaved = existing.some(
    (s) =>
      s.sessionExerciseId === pending.sessionExerciseId &&
      s.setNumber === pending.setNumber &&
      s.clientId === pending.clientId
  );
  
  if (!alreadySaved) {
    all[sessionId] = {
      sets: [...existing, pending],
      timestamp: deps.now(),
    };
    storage.setItem(storageKey(userId), JSON.stringify(all));
  }
}

/**
 * Clear all pending sets for a session.
 */
export function clearPendingSets(storage: Storage, userId: string, sessionId: string, deps: PendingSetDeps): void {
  const all = loadAllPendingSetsWithTimestamp(storage, userId, deps);
  delete all[sessionId];
  if (Object.keys(all).length === 0) {
    storage.removeItem(storageKey(userId));
  } else {
    storage.setItem(storageKey(userId), JSON.stringify(all));
  }
}

/**
 * Clear a specific pending set from a session.
 */
export function clearPendingSet(
  storage: Storage,
  userId: string,
  sessionId: string,
  clientId: string,
  deps: PendingSetDeps
): void {
  const all = loadAllPendingSetsWithTimestamp(storage, userId, deps);
  const existing = all[sessionId]?.sets ?? [];
  const filtered = existing.filter((s) => s.clientId !== clientId);
  
  if (filtered.length === 0) {
    delete all[sessionId];
    if (Object.keys(all).length === 0) {
      storage.removeItem(storageKey(userId));
    } else {
      storage.setItem(storageKey(userId), JSON.stringify(all));
    }
  } else {
    all[sessionId] = {
      sets: filtered,
      timestamp: all[sessionId].timestamp,
    };
    storage.setItem(storageKey(userId), JSON.stringify(all));
  }
}

/**
 * Clear all pending sets for a user (used on sign-out).
 */
export function clearAllPendingSetsForUser(
  storage: Storage,
  userId: string
): void {
  storage.removeItem(storageKey(userId));
}

/**
 * Replay all pending sets for a user across all sessions.
 * Returns the number of sets still pending after replay.
 */
export async function replayAllPendingSetsForUser(
  storage: Storage,
  userId: string,
  deps: PendingSetDeps,
  logSet: (params: {
    sessionExerciseId: string;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
  }) => Promise<{ ok: true } | { ok: false; error: string; code?: string } | { ok: false; reason: "set_exists" }>
): Promise<number> {
  const all = loadAllPendingSetsWithTimestamp(storage, userId, deps);
  
  let remainingCount = 0;
  
  for (const sessionId in all) {
    const { sets } = all[sessionId];
    
    for (const set of sets) {
      try {
        const result = await logSet({
          sessionExerciseId: set.sessionExerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightKg: set.weightKg,
          durationSeconds: set.durationSeconds,
        });
        
        // Success or duplicate - clear the set
        if (result.ok || ("reason" in result && result.reason === "set_exists")) {
          clearPendingSet(storage, userId, sessionId, set.clientId, deps);
        } else {
          // Failed - keep it pending
          remainingCount++;
        }
      } catch {
        // Network or other error - keep it pending
        remainingCount++;
      }
    }
  }
  
  return remainingCount;
}

/**
 * Get the total count of pending sets for a user across all sessions.
 */
export function getPendingSetCountForUser(
  storage: Storage,
  userId: string,
  deps: PendingSetDeps
): number {
  const all = loadAllPendingSetsWithTimestamp(storage, userId, deps);
  
  let count = 0;
  for (const sessionId in all) {
    count += all[sessionId].sets.length;
  }
  
  return count;
}

/**
 * Check if an error is a unique violation (23505) or server "already saved" result.
 */
export function isDuplicateError(errOrResponse: unknown): boolean {
  if (
    errOrResponse &&
    typeof errOrResponse === 'object' &&
    'ok' in errOrResponse &&
    errOrResponse.ok === false &&
    'code' in errOrResponse
  ) {
    return errOrResponse.code === '23505';
  }
  
  return false;
}

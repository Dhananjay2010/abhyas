/**
 * Pending set retry logic for session expiry.
 * 
 * Keeps sets that failed to save due to session expiration, persists them across
 * sign-in redirect in localStorage, and replays ALL pending sets once when the
 * user returns authenticated. Treats 23505 unique violations as success to prevent
 * double-saves.
 */

export type PendingSet = {
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  /** Client-generated idempotency key to detect duplicate saves. */
  clientId: string;
};

export type PendingSets = {
  [sessionId: string]: PendingSet[];
};

type PendingSetsWithTimestamp = {
  [sessionId: string]: {
    sets: PendingSet[];
    timestamp: number;
  };
};

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type LogSetFunction = (input: {
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds?: number | null;
}) => Promise<{ ok: boolean; error?: string; code?: string }>;

export type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * Generate a storage key for all pending sets.
 */
export function storageKey(): string {
  return `pending-sets`;
}

/**
 * Validate that a value is a well-formed PendingSet.
 */
function isValidPendingSet(value: unknown): value is PendingSet {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  
  return (
    typeof obj.sessionExerciseId === 'string' &&
    typeof obj.setNumber === 'number' &&
    (obj.reps === null || typeof obj.reps === 'number') &&
    (obj.weightKg === null || typeof obj.weightKg === 'number') &&
    (obj.durationSeconds === null || typeof obj.durationSeconds === 'number') &&
    typeof obj.clientId === 'string'
  );
}

/**
 * Validate that a value is a plain object of arrays of well-formed PendingSets.
 */
function isValidPendingSets(value: unknown): value is PendingSets {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  
  const obj = value as Record<string, unknown>;
  for (const key in obj) {
    const entry = obj[key];
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  
  const obj = value as Record<string, unknown>;
  for (const key in obj) {
    const entry = obj[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const timestamped = entry as Record<string, unknown>;
    if (!Array.isArray(timestamped.sets) || typeof timestamped.timestamp !== 'number') {
      return false;
    }
    for (const set of timestamped.sets) {
      if (!isValidPendingSet(set)) return false;
    }
  }
  
  return true;
}

/**
 * Prune stale entries older than STALE_THRESHOLD_MS.
 */
function pruneStaleEntries(data: PendingSetsWithTimestamp): PendingSetsWithTimestamp {
  const now = Date.now();
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
function loadAllPendingSetsWithTimestamp(storage: Storage): PendingSetsWithTimestamp {
  try {
    const raw = storage.getItem(storageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    
    // Try new timestamped format first
    if (isValidTimestampedSets(parsed)) {
      const pruned = pruneStaleEntries(parsed);
      // Save pruned version back to storage
      if (Object.keys(pruned).length === 0) {
        storage.removeItem(storageKey());
      } else if (Object.keys(pruned).length < Object.keys(parsed).length) {
        storage.setItem(storageKey(), JSON.stringify(pruned));
      }
      return pruned;
    }
    
    // Legacy format (plain object of arrays) - migrate to timestamped
    if (isValidPendingSets(parsed)) {
      const now = Date.now();
      const timestamped: PendingSetsWithTimestamp = {};
      for (const sessionId in parsed) {
        timestamped[sessionId] = {
          sets: parsed[sessionId],
          timestamp: now,
        };
      }
      storage.setItem(storageKey(), JSON.stringify(timestamped));
      return timestamped;
    }
    
    // Invalid shape - clear storage and return empty
    storage.removeItem(storageKey());
    return {};
  } catch {
    // Invalid JSON - clear storage and return empty
    storage.removeItem(storageKey());
    return {};
  }
}

/**
 * Load all pending sets from storage.
 */
export function loadAllPendingSets(storage: Storage): PendingSets {
  const timestamped = loadAllPendingSetsWithTimestamp(storage);
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
  sessionId: string
): PendingSet[] {
  const all = loadAllPendingSets(storage);
  return all[sessionId] ?? [];
}

/**
 * Save a pending set to storage (adds to the list for this session).
 */
export function savePendingSet(
  storage: Storage,
  sessionId: string,
  pending: PendingSet
): void {
  const all = loadAllPendingSetsWithTimestamp(storage);
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
      timestamp: Date.now(),
    };
    storage.setItem(storageKey(), JSON.stringify(all));
  }
}

/**
 * Clear all pending sets for a session.
 */
export function clearPendingSets(storage: Storage, sessionId: string): void {
  const all = loadAllPendingSetsWithTimestamp(storage);
  delete all[sessionId];
  if (Object.keys(all).length === 0) {
    storage.removeItem(storageKey());
  } else {
    storage.setItem(storageKey(), JSON.stringify(all));
  }
}

/**
 * Clear a specific pending set from a session.
 */
export function clearPendingSet(
  storage: Storage,
  sessionId: string,
  clientId: string
): void {
  const all = loadAllPendingSetsWithTimestamp(storage);
  const existing = all[sessionId]?.sets ?? [];
  const filtered = existing.filter((s) => s.clientId !== clientId);
  
  if (filtered.length === 0) {
    delete all[sessionId];
    if (Object.keys(all).length === 0) {
      storage.removeItem(storageKey());
    } else {
      storage.setItem(storageKey(), JSON.stringify(all));
    }
  } else {
    all[sessionId] = {
      sets: filtered,
      timestamp: all[sessionId].timestamp, // Preserve timestamp
    };
    storage.setItem(storageKey(), JSON.stringify(all));
  }
}

/**
 * Check if an error is a unique violation (23505) or server "already saved" result.
 */
export function isDuplicateError(errOrResponse: unknown): boolean {
  if (
    errOrResponse &&
    typeof errOrResponse === 'object' &&
    'ok' in errOrResponse &&
    errOrResponse.ok === false
  ) {
    const err = errOrResponse as { ok: false; error?: string; code?: string };
    return err.code === '23505';
  }
  
  return false;
}

/**
 * Attempt to log a set, handling session expiry by persisting for retry.
 * 
 * Returns:
 * - { ok: true, saved: true } - Set was saved successfully
 * - { ok: true, saved: false, sessionExpired: true } - Session expired, set is pending
 * - { ok: false, error: string } - Non-auth failure
 */

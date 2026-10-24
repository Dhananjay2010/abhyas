/**
 * Pending set retry logic for session expiry.
 * 
 * Keeps sets that failed to save due to session expiration, persists them across
 * sign-in redirect in localStorage, and replays ALL pending sets once when the
 * user returns authenticated. Treats 23505 unique violations as success to prevent
 * double-saves.
 */

import { isSessionExpired } from "./session-expired-shim";

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
 * Load all pending sets from storage.
 */
export function loadAllPendingSets(storage: Storage): PendingSets {
  try {
    const raw = storage.getItem(storageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PendingSets;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
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
  const all = loadAllPendingSets(storage);
  const existing = all[sessionId] ?? [];
  
  const alreadySaved = existing.some(
    (s) =>
      s.sessionExerciseId === pending.sessionExerciseId &&
      s.setNumber === pending.setNumber &&
      s.clientId === pending.clientId
  );
  
  if (!alreadySaved) {
    all[sessionId] = [...existing, pending];
    storage.setItem(storageKey(), JSON.stringify(all));
  }
}

/**
 * Clear all pending sets for a session.
 */
export function clearPendingSets(storage: Storage, sessionId: string): void {
  const all = loadAllPendingSets(storage);
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
  const all = loadAllPendingSets(storage);
  const existing = all[sessionId] ?? [];
  const filtered = existing.filter((s) => s.clientId !== clientId);
  
  if (filtered.length === 0) {
    delete all[sessionId];
    if (Object.keys(all).length === 0) {
      storage.removeItem(storageKey());
    } else {
      storage.setItem(storageKey(), JSON.stringify(all));
    }
  } else {
    all[sessionId] = filtered;
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

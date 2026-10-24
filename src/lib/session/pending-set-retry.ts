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
  if (errOrResponse instanceof Error) {
    const msg = errOrResponse.message.toLowerCase();
    return msg.includes('23505') || 
           msg.includes('unique') || 
           msg.includes('already saved') ||
           msg.includes('duplicate key');
  }
  
  if (
    errOrResponse &&
    typeof errOrResponse === 'object' &&
    'ok' in errOrResponse &&
    errOrResponse.ok === false
  ) {
    const err = errOrResponse as { ok: false; error?: string; code?: string };
    const errorMsg = err.error?.toLowerCase() || '';
    return errorMsg.includes('23505') || 
           errorMsg.includes('unique') || 
           errorMsg.includes('already saved') ||
           errorMsg.includes('duplicate key') ||
           err.code === '23505';
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
export async function logSetWithRetry(
  logSet: LogSetFunction,
  storage: Storage,
  sessionId: string,
  input: {
    sessionExerciseId: string;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds?: number | null;
  },
  clientId: string
): Promise<
  | { ok: true; saved: true }
  | { ok: true; saved: false; sessionExpired: true }
  | { ok: false; error: string }
> {
  try {
    const result = await logSet(input);
    
    if (result.ok) {
      return { ok: true, saved: true };
    }
    
    if (isSessionExpired(result)) {
      const pending: PendingSet = {
        sessionExerciseId: input.sessionExerciseId,
        setNumber: input.setNumber,
        reps: input.reps,
        weightKg: input.weightKg,
        durationSeconds: input.durationSeconds ?? null,
        clientId,
      };
      savePendingSet(storage, sessionId, pending);
      return { ok: true, saved: false, sessionExpired: true };
    }
    
    if (isDuplicateError(result)) {
      return { ok: true, saved: true };
    }
    
    return { ok: false, error: result.error ?? "Failed to save set" };
  } catch (err) {
    if (isSessionExpired(err)) {
      const pending: PendingSet = {
        sessionExerciseId: input.sessionExerciseId,
        setNumber: input.setNumber,
        reps: input.reps,
        weightKg: input.weightKg,
        durationSeconds: input.durationSeconds ?? null,
        clientId,
      };
      savePendingSet(storage, sessionId, pending);
      return { ok: true, saved: false, sessionExpired: true };
    }
    
    if (isDuplicateError(err)) {
      return { ok: true, saved: true };
    }
    
    const message = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: message };
  }
}

/**
 * Replay all pending sets for a session once, idempotently.
 * 
 * Returns:
 * - { ok: true, replayed: number } - Number of sets successfully saved
 * - { ok: false, error: string, replayed: number } - Partial failure, some sets may have saved
 */
export async function replayPendingSets(
  logSet: LogSetFunction,
  storage: Storage,
  sessionId: string
): Promise<
  | { ok: true; replayed: number }
  | { ok: false; error: string; replayed: number }
> {
  const pending = loadPendingSets(storage, sessionId);
  
  if (pending.length === 0) {
    return { ok: true, replayed: 0 };
  }
  
  let replayed = 0;
  let firstError: string | null = null;
  
  for (const set of pending) {
    try {
      const result = await logSet({
        sessionExerciseId: set.sessionExerciseId,
        setNumber: set.setNumber,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSeconds: set.durationSeconds,
      });
      
      if (result.ok || isDuplicateError(result)) {
        clearPendingSet(storage, sessionId, set.clientId);
        replayed++;
      } else if (isSessionExpired(result)) {
        if (!firstError) firstError = "Session still expired";
      } else {
        if (!firstError) firstError = result.error ?? "Failed to replay set";
      }
    } catch (err) {
      if (isDuplicateError(err)) {
        clearPendingSet(storage, sessionId, set.clientId);
        replayed++;
      } else if (!firstError) {
        firstError = err instanceof Error ? err.message : "Network error";
      }
    }
  }
  
  if (firstError && replayed === 0) {
    return { ok: false, error: firstError, replayed: 0 };
  }
  
  if (firstError) {
    return { ok: false, error: firstError, replayed };
  }
  
  return { ok: true, replayed };
}

/**
 * Session state cache for offline reload hydration.
 * 
 * Saves last-known session state (exercises and their sets) to localStorage
 * when online, so the session runner can hydrate from the cache when reloaded offline.
 * 
 * Keyed by user ID and session ID to support multiple users on the same device.
 */

export type CachedSessionState = {
  sessionId: string;
  exercises: Array<{
    id: string;
    name: string;
    sets: Array<{
      setNumber: number;
      reps: number | null;
      weightKg: number | null;
      durationSeconds: number | null;
    }>;
  }>;
  timestamp: number;
};

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a storage key for session state cache keyed by user and session.
 */
function storageKey(userId: string, sessionId: string): string {
  return `session-state:${userId}:${sessionId}`;
}

/**
 * Save session state to localStorage.
 */
export function saveSessionState(
  storage: Storage,
  userId: string,
  sessionId: string,
  exercises: CachedSessionState['exercises'],
  now: () => number,
): void {
  try {
    const state: CachedSessionState = {
      sessionId,
      exercises,
      timestamp: now(),
    };
    storage.setItem(storageKey(userId, sessionId), JSON.stringify(state));
  } catch {
    // Ignore storage errors (quota exceeded, private mode, etc.)
  }
}

/**
 * Load session state from localStorage.
 * Returns null if not found, stale, or invalid.
 */
export function loadSessionState(
  storage: Storage,
  userId: string,
  sessionId: string,
  now: () => number,
): CachedSessionState | null {
  try {
    const raw = storage.getItem(storageKey(userId, sessionId));
    if (!raw) return null;
    
    const parsed = JSON.parse(raw);
    if (!isValidSessionState(parsed)) {
      storage.removeItem(storageKey(userId, sessionId));
      return null;
    }
    
    if (now() - parsed.timestamp > STALE_THRESHOLD_MS) {
      storage.removeItem(storageKey(userId, sessionId));
      return null;
    }
    
    return parsed;
  } catch {
    storage.removeItem(storageKey(userId, sessionId));
    return null;
  }
}

/**
 * Clear session state from localStorage.
 */
export function clearSessionState(
  storage: Storage,
  userId: string,
  sessionId: string,
): void {
  storage.removeItem(storageKey(userId, sessionId));
}

/**
 * Type guard to check if value is a well-formed CachedSessionState.
 */
function isValidSessionState(value: unknown): value is CachedSessionState {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  
  if (typeof obj.sessionId !== 'string') return false;
  if (typeof obj.timestamp !== 'number') return false;
  if (!Array.isArray(obj.exercises)) return false;
  
  for (const exercise of obj.exercises) {
    if (!exercise || typeof exercise !== 'object') return false;
    const ex = exercise as Record<string, unknown>;
    
    if (typeof ex.id !== 'string') return false;
    if (typeof ex.name !== 'string') return false;
    if (!Array.isArray(ex.sets)) return false;
    
    for (const set of ex.sets) {
      if (!set || typeof set !== 'object') return false;
      const s = set as Record<string, unknown>;
      
      if (typeof s.setNumber !== 'number') return false;
      if (s.reps !== null && typeof s.reps !== 'number') return false;
      if (s.weightKg !== null && typeof s.weightKg !== 'number') return false;
      if (s.durationSeconds !== null && typeof s.durationSeconds !== 'number') return false;
    }
  }
  
  return true;
}

/**
 * Pending settings changes stashed in sessionStorage when a session expires.
 * Preserved for ~10 minutes so they can be re-applied after sign-in.
 */

const STORAGE_KEY = 'abhyas_pending_settings';
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export type SaveType = 'profile' | 'session' | 'equipment' | 'injuries';

export interface PendingChange {
  key: string;
  type: SaveType;
  patch: unknown;
  affectsPlan?: boolean;
  timestamp: number;
}

export interface PendingChangesPayload {
  changes: PendingChange[];
  returnPath: string;
  userId?: string;
}

function isStorageAvailable(): boolean {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return false;
  }
  try {
    const testKey = '__test_storage__';
    window.sessionStorage.setItem(testKey, 'test');
    window.sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function stashPendingChanges(changes: PendingChange[], returnPath: string, userId?: string): boolean {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    const payload: PendingChangesPayload = {
      changes: changes.map(ch => ({
        key: ch.key,
        type: ch.type,
        patch: ch.patch,
        affectsPlan: ch.affectsPlan,
        timestamp: ch.timestamp || Date.now()
      })),
      returnPath,
      userId
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function getPendingChanges(currentUserId?: string): PendingChangesPayload | null {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const payload: PendingChangesPayload = JSON.parse(raw);
    
    // Drop stash if userId doesn't match (or if legacy stash has no userId)
    if (currentUserId && payload.userId !== currentUserId) {
      clearPendingChanges();
      return null;
    }
    
    // Drop legacy stash (no userId field) as a security precaution
    if (!payload.userId) {
      clearPendingChanges();
      return null;
    }

    const now = Date.now();
    
    const validChanges = payload.changes.filter(ch => {
      return (now - ch.timestamp) < MAX_AGE_MS;
    });

    if (validChanges.length === 0) {
      clearPendingChanges();
      return null;
    }

    return {
      changes: validChanges,
      returnPath: payload.returnPath,
      userId: payload.userId
    };
  } catch {
    clearPendingChanges();
    return null;
  }
}

export function clearPendingChanges(): void {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

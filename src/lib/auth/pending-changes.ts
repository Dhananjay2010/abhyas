/**
 * Pending settings changes stashed in sessionStorage when a session expires.
 * Preserved for ~10 minutes so they can be re-applied after sign-in.
 */

const STORAGE_KEY = 'abhyas_pending_settings';
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export interface PendingChange {
  field: string;
  value: unknown;
  timestamp: number;
}

export interface PendingChangesPayload {
  changes: PendingChange[];
  returnPath: string;
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

export function stashPendingChanges(changes: PendingChange[], returnPath: string): boolean {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    const payload: PendingChangesPayload = {
      changes: changes.map(ch => ({
        field: ch.field,
        value: ch.value,
        timestamp: ch.timestamp || Date.now()
      })),
      returnPath
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function getPendingChanges(): PendingChangesPayload | null {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const payload: PendingChangesPayload = JSON.parse(raw);
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
      returnPath: payload.returnPath
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

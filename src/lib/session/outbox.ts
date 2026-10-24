/**
 * Offline-safe set logging outbox.
 *
 * When a set save fails or the device is offline, the set is queued locally
 * with a client-generated idempotency key. On reconnect, queued sets are
 * retried in order. The existing upsert onConflict is idempotent: replaying
 * the same exercise+setNumber overwrites with identical values.
 *
 * Testable: storage and sender are injected, so tests can run against fake
 * implementations without touching localStorage or the network.
 */

import { isNetworkError } from "./network-error";
import { mapErrorToUserMessage } from "./error-messages";
import { isQuotaError } from "./quota-error";

export type QueuedSet = {
  clientId: string; // UUID, client-side only (not sent to server)
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  queuedAt: number; // timestamp (ms since epoch)
  retries: number;
};

export type OutboxState = {
  pending: QueuedSet[];
  failed: Array<{
    set: QueuedSet;
    error: string;
    failedAt: number;
  }>;
};

/**
 * Classify the outcome of a logSet attempt for offline handling.
 *
 * - 'saved': set was saved successfully
 * - 'invalid': validation error, don't queue (show error to user)
 * - 'queue': transient error or throw, queue for retry
 */
export type LogSetOutcome = "saved" | "invalid" | "queue";

export function classifyLogSetOutcome(
  resultOrThrown:
    | { ok: true; data: { code?: string } }
    | { ok: false; error: string; data?: { code?: string } }
    | { thrown: unknown }
): { outcome: LogSetOutcome; error?: string; isNetwork?: boolean } {
  // Thrown error (network failure, fetch timeout, etc.)
  if ("thrown" in resultOrThrown) {
    const err = resultOrThrown.thrown;
    const isNetwork = isNetworkError(err);
    // Map network errors to user-friendly copy
    const errorMessage = isNetwork
      ? "You're offline. Saved on this phone, will sync when you're back online."
      : (err instanceof Error ? err.message : "Network error");
    return {
      outcome: "queue",
      error: errorMessage,
      isNetwork,
    };
  }

  // Success
  if (resultOrThrown.ok) {
    return { outcome: "saved" };
  }

  // Validation error (permanent)
  if (
    resultOrThrown.data &&
    typeof resultOrThrown.data === "object" &&
    "code" in resultOrThrown.data &&
    resultOrThrown.data.code === "invalid"
  ) {
    return { outcome: "invalid", error: resultOrThrown.error };
  }

  // Other server error (transient)
  return { outcome: "queue", error: resultOrThrown.error };
}

/**
 * Compute the next set number for an exercise.
 *
 * Takes all sets (including failed and unsaved) to avoid collisions.
 * Pure function for testability.
 */
export function nextSetNumberFor(sets: Array<{ setNumber: number }>): number {
  if (sets.length === 0) return 1;
  return Math.max(...sets.map((s) => s.setNumber)) + 1;
}

/**
 * Merge pending sets from the outbox into exercises.
 *
 * After a reload, exercises come from the server without pending sets,
 * so nextSetNumber would reuse a queued set's number. This merges
 * pending sets back into the exercises array before computing nextSetNumber.
 *
 * Pure function for testability.
 */
export function mergePendingSets<
  T extends {
    id: string;
    sets: Array<{ setNumber: number; pending?: boolean; clientId?: string; [key: string]: unknown }>;
  },
>(exercises: T[], pending: QueuedSet[]): T[] {
  if (pending.length === 0) return exercises;

  return exercises.map((ex) => {
    const pendingForExercise = pending.filter((p) => p.sessionExerciseId === ex.id);
    if (pendingForExercise.length === 0) return ex;

    const merged = [...ex.sets];
    for (const p of pendingForExercise) {
      // Check if this set number is already in the list (including pending)
      const existing = merged.find((s) => s.setNumber === p.setNumber);
      if (!existing) {
        merged.push({
          setNumber: p.setNumber,
          reps: p.reps,
          weightKg: p.weightKg,
          durationSeconds: p.durationSeconds,
          pending: true,
          clientId: p.clientId,
        } as T["sets"][number]);
      }
    }

    // Sort by set number
    merged.sort((a, b) => a.setNumber - b.setNumber);

    return { ...ex, sets: merged };
  });
}

/**
 * Result of a send attempt: success, permanent error (validation), or transient error.
 * Network flag indicates if transient error was network-related (doesn't count toward retry budget).
 */
export type SendResult =
  | { ok: true }
  | { ok: false; permanent: true; error: string }
  | { ok: false; permanent: false; error: string; network?: boolean };

/**
 * Storage interface - injectable for testing.
 */
export interface OutboxStorage {
  get(): OutboxState | null;
  set(state: OutboxState): void;
}

/**
 * Sender interface - the actual network call, injectable for testing.
 */
export interface OutboxSender {
  send(set: Omit<QueuedSet, "clientId" | "queuedAt" | "retries">): Promise<SendResult>;
}

/**
 * Create a default localStorage-backed storage.
 */
export function createLocalStorage(key: string): OutboxStorage {
  return {
    get() {
      if (typeof window === "undefined") return null;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as OutboxState;
      } catch {
        return null;
      }
    },
    set(state: OutboxState) {
      if (typeof window === "undefined") return;
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch (err) {
        // Quota exceeded: DON'T delete data. Rethrow original error
        // so caller can surface it to the user.
        throw err;
      }
    },
  };
}

// Module-level flush locks: per storage key (not per Outbox instance)
// Prevents double-mount (React dev mode) from breaking concurrency guard
const flushLocks = new Set<string>();

/**
 * The outbox: queue, flush, and query pending sets.
 */
export class Outbox {
  constructor(
    private storage: OutboxStorage,
    private sender: OutboxSender,
    private storageKey: string,
  ) {}

  /**
   * Generate a client UUID for a new set (client-side dedup only).
   */
  static generateClientId(): string {
    // crypto.randomUUID() is available in modern browsers and Node 19+
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older environments
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Queue a set for later delivery.
   */
  enqueue(set: Omit<QueuedSet, "clientId" | "queuedAt" | "retries">): string {
    const state = this.storage.get() ?? { pending: [], failed: [] };

    // Client-side dedup: check if this exercise+setNumber is already queued
    const existing = state.pending.find(
      (s) => s.sessionExerciseId === set.sessionExerciseId && s.setNumber === set.setNumber,
    );
    if (existing) {
      return existing.clientId; // Already queued, return existing clientId
    }

    const clientId = Outbox.generateClientId();
    const queued: QueuedSet = {
      ...set,
      clientId,
      queuedAt: Date.now(),
      retries: 0,
    };

    state.pending.push(queued);
    this.storage.set(state);

    return clientId;
  }

  /**
   * Check if a flush is currently in progress.
   */
  isFlushing(): boolean {
    return flushLocks.has(this.storageKey);
  }

  /**
   * How many sets are waiting to be sent.
   */
  pendingCount(): number {
    const state = this.storage.get();
    return state?.pending.length ?? 0;
  }

  /**
   * Get all pending sets, in queue order (oldest first).
   */
  getPending(): QueuedSet[] {
    const state = this.storage.get();
    return state?.pending ?? [];
  }

  /**
   * Get all permanently failed sets.
   */
  getFailed(): OutboxState["failed"] {
    const state = this.storage.get();
    return state?.failed ?? [];
  }

  /**
   * Remove a set from both pending and failed lists.
   * Used when undoing a queued or failed set.
   */
  remove(clientId: string): void {
    const state = this.storage.get();
    if (!state) return;
    state.pending = state.pending.filter((s) => s.clientId !== clientId);
    state.failed = state.failed.filter((f) => f.set.clientId !== clientId);
    this.storage.set(state);
  }

  /**
   * Check if the outbox is empty (both pending and failed).
   */
  isEmpty(): boolean {
    const state = this.storage.get();
    return !state || (state.pending.length === 0 && state.failed.length === 0);
  }

  /**
   * Clear the entire outbox and remove from localStorage.
   */
  clear(): void {
    this.storage.set({ pending: [], failed: [] });
    // Remove from localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(this.storageKey);
      } catch {
        // Ignore storage errors
      }
    }
  }

  /**
   * Flush the outbox: send all pending sets in order.
   *
   * Returns the clientIds of successfully sent sets and whether flush stopped early.
   * Stops on the first transient error (preserving order), but skips permanently
   * failed sets (moving them to the failed list).
   *
   * Guarded against concurrent calls: only one flush runs at a time per storage key.
   * If already flushing, returns immediately with skipped=true.
   */
  async flush(): Promise<{ sentClientIds: string[]; stopped: boolean; skipped: boolean }> {
    // Concurrency guard: module-level per storage key
    if (flushLocks.has(this.storageKey)) {
      return { sentClientIds: [], stopped: false, skipped: true };
    }

    flushLocks.add(this.storageKey);
    try {
      const state = this.storage.get();
      if (!state || state.pending.length === 0) {
        return { sentClientIds: [], stopped: false, skipped: false };
      }

      const sentClientIds: string[] = [];
      const failedClientIds: string[] = [];

      for (const set of state.pending) {
        // Re-read storage before each send to catch removals (S1a)
        const currentState = this.storage.get();
        if (!currentState) break;

        // Skip if this set was removed during flush
        const stillPending = currentState.pending.find((s) => s.clientId === set.clientId);
        if (!stillPending) continue;

        // Move to failed if retries >= 10 (S2)
        if (set.retries >= 10) {
          failedClientIds.push(set.clientId);
          currentState.failed.push({
            set,
            error: mapErrorToUserMessage(null, "Failed after 10 retries"),
            failedAt: Date.now(),
          });
          this.storage.set(currentState);
          continue;
        }

        const result = await this.sender.send({
          sessionExerciseId: set.sessionExerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightKg: set.weightKg,
          durationSeconds: set.durationSeconds,
        });

        if (result.ok) {
          sentClientIds.push(set.clientId);
        } else if (result.permanent) {
          // Permanent error (validation) - move to failed list
          failedClientIds.push(set.clientId);
          const updatedState = this.storage.get() ?? { pending: [], failed: [] };
          updatedState.failed.push({
            set,
            error: result.error,
            failedAt: Date.now(),
          });
          this.storage.set(updatedState);
        } else {
          // Transient error: stop here, keep this and remaining sets
          // Re-read storage to avoid wiping concurrent enqueues
          const finalState = this.storage.get() ?? { pending: [], failed: [] };
          finalState.pending = finalState.pending.filter(
            (s) => !sentClientIds.includes(s.clientId) && !failedClientIds.includes(s.clientId),
          );
          // S8: Only increment retries on non-network failures
          // Network failures don't use up the retry budget
          const failedSet = finalState.pending.find((s) => s.clientId === set.clientId);
          if (failedSet && !result.network) {
            failedSet.retries++;
          }
          this.storage.set(finalState);
          return { sentClientIds, stopped: true, skipped: false };
        }
      }

      // All sets processed: re-read storage and remove only sent/failed
      const finalState = this.storage.get() ?? { pending: [], failed: [] };
      finalState.pending = finalState.pending.filter(
        (s) => !sentClientIds.includes(s.clientId) && !failedClientIds.includes(s.clientId),
      );
      try {
        this.storage.set(finalState);
      } catch (err) {
        // Quota exceeded: sets were saved on server but can't update local storage
        // Throw with a special message so the hook can show it to the user
        if (isQuotaError(err)) {
          throw new Error("FLUSH_STORAGE_QUOTA_EXCEEDED");
        }
        throw err;
      }
      return { sentClientIds, stopped: false, skipped: false };
    } finally {
      flushLocks.delete(this.storageKey);
    }
  }
}

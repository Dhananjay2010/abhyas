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
): { outcome: LogSetOutcome; error?: string } {
  // Thrown error (network failure, fetch timeout, etc.)
  if ("thrown" in resultOrThrown) {
    const err = resultOrThrown.thrown;
    return {
      outcome: "queue",
      error: err instanceof Error ? err.message : "Network error",
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
    sets: Array<{ setNumber: number; pending?: boolean; clientId?: string }>;
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
 */
export type SendResult =
  | { ok: true }
  | { ok: false; permanent: true; error: string }
  | { ok: false; permanent: false; error: string };

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
        // Quota exceeded: DON'T delete data. Keep the state in memory
        // and surface the error to the user.
        if (err instanceof Error && err.name === "QuotaExceededError") {
          throw new Error("QUOTA_EXCEEDED");
        }
        throw err;
      }
    },
  };
}

/**
 * The outbox: queue, flush, and query pending sets.
 */
export class Outbox {
  private flushInFlight = false;

  constructor(
    private storage: OutboxStorage,
    private sender: OutboxSender,
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
    try {
      this.storage.set(state);
    } catch (err) {
      if (err instanceof Error && err.message === "QUOTA_EXCEEDED") {
        // Rethrow so caller can handle
        throw err;
      }
      throw err;
    }

    return clientId;
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
   * Clear a permanently failed set from the outbox.
   */
  clearFailed(clientId: string): void {
    const state = this.storage.get();
    if (!state) return;
    state.failed = state.failed.filter((f) => f.set.clientId !== clientId);
    this.storage.set(state);
  }

  /**
   * Flush the outbox: send all pending sets in order.
   *
   * Returns the clientIds of successfully sent sets and whether flush stopped early.
   * Stops on the first transient error (preserving order), but skips permanently
   * failed sets (moving them to the failed list).
   *
   * Guarded against concurrent calls: only one flush runs at a time.
   * If already flushing, returns immediately with skipped=true.
   */
  async flush(): Promise<{ sentClientIds: string[]; stopped: boolean; skipped: boolean }> {
    // Concurrency guard: if a flush is already in flight, return immediately
    if (this.flushInFlight) {
      return { sentClientIds: [], stopped: false, skipped: true };
    }

    this.flushInFlight = true;
    try {
      const state = this.storage.get();
      if (!state || state.pending.length === 0) {
        return { sentClientIds: [], stopped: false, skipped: false };
      }

      const sentClientIds: string[] = [];
      const stillPending: QueuedSet[] = [];

      for (const set of state.pending) {
        const result = await this.sender.send({
          sessionExerciseId: set.sessionExerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightKg: set.weightKg,
          durationSeconds: set.durationSeconds,
        });

        if (result.ok) {
          sentClientIds.push(set.clientId);
          // Successfully sent - don't re-queue
        } else if (result.permanent) {
          // Permanent error (validation) - move to failed list, don't retry
          state.failed.push({
            set,
            error: result.error,
            failedAt: Date.now(),
          });
        } else {
          // Transient error (network, 5xx) - stop here, keep this and all
          // remaining sets in the queue (preserving order)
          stillPending.push({ ...set, retries: set.retries + 1 });
          stillPending.push(...state.pending.slice(state.pending.indexOf(set) + 1));
          this.storage.set({ ...state, pending: stillPending });
          return { sentClientIds, stopped: true, skipped: false };
        }
      }

      // All sets processed (either sent or moved to failed)
      this.storage.set({ ...state, pending: stillPending });
      return { sentClientIds, stopped: false, skipped: false };
    } finally {
      this.flushInFlight = false;
    }
  }

  /**
   * Clear the entire outbox (for testing or emergency).
   */
  clear(): void {
    this.storage.set({ pending: [], failed: [] });
  }
}

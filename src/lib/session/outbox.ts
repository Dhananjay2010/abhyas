/**
 * Offline-safe set logging outbox.
 *
 * When a set save fails or the device is offline, the set is queued locally
 * with a client-generated idempotency key. On reconnect, queued sets are
 * retried in order, and the server deduplicates using the idempotency key.
 *
 * Testable: storage and sender are injected, so tests can run against fake
 * implementations without touching localStorage or the network.
 */

export type QueuedSet = {
  clientId: string; // UUID, generated once per set
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
 * Result of a send attempt: success, permanent error (4xx), or transient error.
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
  send(set: QueuedSet): Promise<SendResult>;
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
      } catch {
        // Storage quota exceeded - drop oldest pending sets
        const pruned = { ...state, pending: state.pending.slice(-10) };
        try {
          localStorage.setItem(key, JSON.stringify(pruned));
        } catch {
          // Still failing - clear the outbox entirely
          localStorage.removeItem(key);
        }
      }
    },
  };
}

/**
 * The outbox: queue, flush, and query pending sets.
 */
export class Outbox {
  constructor(
    private storage: OutboxStorage,
    private sender: OutboxSender,
  ) {}

  /**
   * Generate a client UUID for a new set.
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
    const clientId = Outbox.generateClientId();
    const queued: QueuedSet = {
      ...set,
      clientId,
      queuedAt: Date.now(),
      retries: 0,
    };

    const state = this.storage.get() ?? { pending: [], failed: [] };
    state.pending.push(queued);
    this.storage.set(state);

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
   * Returns the number of sets successfully sent. Stops on the first transient
   * error (preserving order), but skips permanently failed sets (moving them to
   * the failed list).
   */
  async flush(): Promise<{ sent: number; stopped: boolean }> {
    const state = this.storage.get();
    if (!state || state.pending.length === 0) {
      return { sent: 0, stopped: false };
    }

    let sent = 0;
    const stillPending: QueuedSet[] = [];

    for (const set of state.pending) {
      const result = await this.sender.send(set);

      if (result.ok) {
        sent++;
        // Successfully sent - don't re-queue
      } else if (result.permanent) {
        // Permanent error (4xx validation) - move to failed list, don't retry
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
        return { sent, stopped: true };
      }
    }

    // All sets processed (either sent or moved to failed)
    this.storage.set({ ...state, pending: stillPending });
    return { sent, stopped: false };
  }

  /**
   * Clear the entire outbox (for testing or emergency).
   */
  clear(): void {
    this.storage.set({ pending: [], failed: [] });
  }
}

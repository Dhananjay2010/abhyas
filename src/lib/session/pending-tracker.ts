/**
 * Pending action tracker for session runner.
 *
 * Tracks in-flight server actions (set logs, exercise finish, etc) so that
 * finish/end-early can wait for all pending saves before proceeding.
 */

export type PendingAction = {
  id: string;
  type: "logSet" | "deleteSet" | "finishExercise";
  promise: Promise<{ ok: boolean; error?: string }>;
};

export type ActionResult = {
  ok: boolean;
  error?: string;
};

export class PendingTracker {
  private pending = new Map<string, PendingAction>();
  private lastResults: ActionResult[] = [];

  /**
   * Register a pending action and track its completion.
   */
  track<T extends { ok: boolean; error?: string }>(
    type: "logSet" | "deleteSet" | "finishExercise",
    promise: Promise<T>,
  ): Promise<T> {
    const id = `${type}-${Date.now()}-${Math.random()}`;
    this.pending.set(id, { id, type, promise: promise as Promise<{ ok: boolean; error?: string }> });

    // Store result and clean up when done
    promise.then(
      (result) => {
        this.lastResults.push(result);
        this.pending.delete(id);
      },
      () => {
        this.lastResults.push({ ok: false, error: "Promise rejected" });
        this.pending.delete(id);
      },
    );

    return promise;
  }

  /**
   * Wait for all pending actions to complete.
   */
  async waitForAll(): Promise<void> {
    const pending = Array.from(this.pending.values());
    if (pending.length === 0) return;

    await Promise.allSettled(pending.map((p) => p.promise));
  }

  /**
   * Check if any actions are pending.
   */
  hasPending(): boolean {
    return this.pending.size > 0;
  }

  /**
   * Get count of pending actions.
   */
  pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Check if the last completed actions had any failures.
   * Call this after waitForAll() to see if any saves failed.
   */
  hasRecentFailures(): boolean {
    return this.lastResults.some((r) => !r.ok);
  }

  /**
   * Clear the recent results history.
   */
  clearResults(): void {
    this.lastResults = [];
  }
}

/**
 * Determine if finish/end-early can proceed.
 *
 * Pure function for testability.
 */
export function canFinish(params: {
  pendingSaves: number;
  failedSaves: boolean;
}): { can: boolean; reason: string | null } {
  if (params.failedSaves) {
    return { can: false, reason: "Couldn't save your last set" };
  }

  if (params.pendingSaves > 0) {
    return { can: false, reason: "Saving your set…" };
  }

  return { can: true, reason: null };
}

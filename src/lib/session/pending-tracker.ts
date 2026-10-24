/**
 * Pending action tracker for session runner.
 *
 * Tracks in-flight server actions (set logs, exercise finish, etc) so that
 * finish/end-early can wait for all pending saves before proceeding.
 */

export type PendingAction = {
  id: string;
  type: "logSet" | "deleteSet" | "finishExercise";
  promise: Promise<ActionResult>;
};

export type ActionResult = {
  ok: boolean;
  error?: string;
};

export class PendingTracker {
  private pending = new Map<string, PendingAction>();
  private latestResult: ActionResult | null = null;

  /**
   * Register a pending action and track its completion.
   */
  track<T extends ActionResult>(
    type: "logSet" | "deleteSet" | "finishExercise",
    promise: Promise<T>,
  ): Promise<T> {
    const id = `${type}-${Date.now()}-${Math.random()}`;
    this.pending.set(id, { id, type, promise });

    // Clear previous result when starting a new action
    this.latestResult = null;

    // Store result and clean up when done
    promise.then(
      (result) => {
        this.latestResult = result;
        this.pending.delete(id);
      },
      () => {
        this.latestResult = { ok: false, error: "Promise rejected" };
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
   * Check if the last completed action failed.
   * Call this after waitForAll() to see if the last save failed.
   */
  hasRecentFailures(): boolean {
    return this.latestResult !== null && !this.latestResult.ok;
  }

  /**
   * Clear the recent result.
   */
  clearResults(): void {
    this.latestResult = null;
  }
}

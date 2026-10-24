/**
 * Pure helper functions for offline sync logic.
 * Each function is testable and mutation-testable.
 */

/**
 * Should we attempt to flush the outbox?
 * Returns false if navigator.onLine is false.
 */
export function shouldAttemptFlush(online: boolean | undefined): boolean {
  return online !== false;
}

/**
 * Compute next retry delay in milliseconds based on attempt count.
 * Schedule: 15s, 30s, 60s (then stays at 60s).
 */
export function nextRetryDelay(attempts: number): number {
  if (attempts <= 0) return 0;
  if (attempts === 1) return 15000;
  if (attempts === 2) return 30000;
  return 60000;
}

/**
 * Build a SendResult from a logSet result or thrown error.
 * Includes mapped user-friendly error message and permanent flag.
 */
export function buildSendResult(
  resultOrThrown:
    | { ok: true }
    | { ok: false; error: string; data?: { code?: string; postgresCode?: string } }
    | { thrown: unknown },
  mapError: (code: string | undefined, message?: string) => string,
): {
  ok: boolean;
  permanent?: boolean;
  error?: string;
  network?: boolean;
} {
  // Thrown error
  if ("thrown" in resultOrThrown) {
    const err = resultOrThrown.thrown;
    const message = err instanceof Error ? err.message : "Network error";
    const isNetwork =
      typeof navigator !== "undefined" && navigator.onLine === false ||
      (err instanceof Error && /failed to fetch|network request failed|networkerror|load failed/i.test(err.message));
    return {
      ok: false,
      permanent: false,
      error: mapError(undefined, message),
      network: isNetwork,
    };
  }

  // Success
  if (resultOrThrown.ok) {
    return { ok: true };
  }

  // Failure with code
  const postgresCode = resultOrThrown.data?.postgresCode;
  const isPermanent = resultOrThrown.data?.code === "invalid";
  return {
    ok: false,
    permanent: isPermanent,
    error: mapError(postgresCode, resultOrThrown.error),
  };
}

/**
 * Get the reason string for why finishing is blocked.
 * Returns null if finishing is allowed.
 */
export function finishBlockReason(
  pendingCount: number,
  lostCount: number,
  failedCount: number,
): string | null {
  const reasons: string[] = [];
  if (pendingCount > 0) {
    reasons.push(`${pendingCount} set${pendingCount > 1 ? "s" : ""} still syncing`);
  }
  if (lostCount > 0) {
    reasons.push(`${lostCount} set${lostCount > 1 ? "s" : ""} couldn't be saved`);
  }
  if (failedCount > 0) {
    reasons.push(`${failedCount} set${failedCount > 1 ? "s weren't" : " wasn't"} accepted`);
  }
  return reasons.length > 0 ? reasons.join(", ") + ". Fix or remove them before finishing." : null;
}

/**
 * Can we clear the outbox after finishing the session?
 * Returns true only if there are no pending, lost, or failed sets.
 */
export function canClearOutbox(
  pendingCount: number,
  lostCount: number,
  failedCount: number,
): boolean {
  return pendingCount === 0 && lostCount === 0 && failedCount === 0;
}

/**
 * Find the highest set number for undo targeting.
 * Returns 0 if no sets exist.
 */
export function undoTargetSetNumber(sets: Array<{ setNumber: number }>): number {
  if (sets.length === 0) return 0;
  return Math.max(...sets.map((s) => s.setNumber));
}

/**
 * Map a logSet result to an ActionResult with proper error classification.
 * Tests: 22P02/23514/22003 → invalid, 42501 → invalid, 53300 → transient
 */
export function classifyLogSetError(
  error: { code?: string; message: string },
): { code: "invalid" } | { code: "transient"; message: string } {
  const code = error.code;

  // Permanent errors: data exceptions (22*), integrity (23*), insufficient privilege (42501)
  if (code && (code.startsWith("22") || code.startsWith("23") || code === "42501")) {
    return { code: "invalid" };
  }

  // Everything else is transient
  return { code: "transient", message: error.message };
}

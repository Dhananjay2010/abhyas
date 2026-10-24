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
 *
 * Client validation errors (code="invalid", no postgresCode) are passed through as-is.
 * Database errors are mapped to user-friendly messages.
 */
export function buildSendResult(
  resultOrThrown:
    | { ok: true }
    | { ok: false; error: string; data?: { code?: string; postgresCode?: string } }
    | { thrown: unknown },
  mapError: (code: string | undefined, message?: string) => string,
):
  | { ok: true }
  | { ok: false; permanent: boolean; error: string; network?: boolean } {
  // Thrown error
  if ("thrown" in resultOrThrown) {
    const err = resultOrThrown.thrown;
    const message = err instanceof Error ? err.message : "Network error";
    const isNetwork =
      (typeof navigator !== "undefined" && navigator.onLine === false) ||
      (err instanceof Error &&
        /failed to fetch|network request failed|networkerror|load failed/i.test(err.message));
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

  // Client validation errors: show as-is (don't map)
  if (isPermanent && !postgresCode) {
    return {
      ok: false,
      permanent: true,
      error: resultOrThrown.error,
    };
  }

  // Database errors: map to user-friendly message
  return {
    ok: false,
    permanent: isPermanent,
    error: mapError(postgresCode, resultOrThrown.error),
  };
}

/**
 * Count sets with a specific flag across all exercises.
 * Pure helper for testability.
 */
export function countSetsWithFlag<T extends { sets: Array<{ [key: string]: unknown }> }>(
  exercises: T[],
  flag: 'unsaved' | 'failed' | 'pending'
): number {
  return exercises.reduce((sum, ex) => {
    return sum + ex.sets.filter((s) => {
      const meta = s as { [key: string]: unknown };
      return meta[flag] === true;
    }).length;
  }, 0);
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
 * Pending sets don't block clearing (they will sync later).
 * Only lost/failed sets block clearing.
 */
export function canClearOutbox(
  pendingCount: number,
  lostCount: number,
  failedCount: number,
): boolean {
  return lostCount === 0 && failedCount === 0;
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
 * Classify a Postgres error as invalid (permanent) or transient.
 *
 * Invalid (permanent, don't retry):
 * - 22xxx: Data exceptions (22P02 invalid text, 22003 numeric overflow, etc.)
 * - 23xxx: Integrity constraints (23505 unique, 23514 check, etc.)
 * - 42501: Insufficient privilege
 *
 * Everything else is transient (retry).
 *
 * Justification: 22xxx/23xxx are permanent input errors that won't succeed on
 * retry. Connection/resource errors (08xxx, 53xxx, 40xxx, 57xxx) are transient.
 */
export function classifyLogSetError(
  error: unknown,
): { category: "invalid" | "transient"; postgresCode?: string; message: string } {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "Database error";

  // Permanent errors: data exceptions (22*), integrity (23*), insufficient privilege (42501)
  if (code && (code.startsWith("22") || code.startsWith("23") || code === "42501")) {
    return { category: "invalid", postgresCode: code, message };
  }

  // Everything else is transient
  return { category: "transient", postgresCode: code, message };
}

import { localDateString } from "../dates";

/**
 * Calculate the appropriate finish timestamp for a session.
 *
 * For same-day sessions finished within a reasonable time, use the current time.
 * For stale sessions (from a past day or idle >3h), use the last logged set's
 * timestamp plus a small buffer, so the recorded duration reflects actual training
 * rather than how long the session sat open.
 *
 * This prevents:
 * - A 10-minute workout logged yesterday showing 360-minute duration when finished today
 * - Abandoned-then-resumed sessions recording idle time as training
 *
 * @param params.startedAt - When the session was started (ISO string)
 * @param params.lastSetCompletedAt - When the last set (warmup or working) was logged (ISO string or null)
 * @param params.now - Current time (ISO string)
 * @param params.timezone - User's timezone (IANA string)
 * @param params.sessionLocalDate - The session's local date (YYYY-MM-DD)
 * @param params.plannedRestSeconds - Planned rest between sets, used as buffer (or default 60s)
 * @returns ISO timestamp to use as ended_at, or null if no sets and session is stale
 */
export function finishTimestamp(params: {
  startedAt: string;
  lastSetCompletedAt: string | null;
  now: string;
  timezone: string;
  sessionLocalDate: string;
  plannedRestSeconds?: number | null;
}): string | null {
  const startedMs = new Date(params.startedAt).getTime();
  const nowMs = new Date(params.now).getTime();
  const todayLocal = localDateString(params.timezone);

  // Session is stale if:
  // 1. Local date is before today, OR
  // 2. More than 3 hours have passed since started_at
  const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
  const isStale =
    params.sessionLocalDate < todayLocal ||
    nowMs - startedMs > THREE_HOURS_MS;

  // Normal same-day finish: use current time
  if (!isStale) {
    return params.now;
  }

  // Stale session with no sets: return null (caller will use duration 0)
  if (!params.lastSetCompletedAt) {
    return null;
  }

  // Stale session with sets: use last set time + buffer
  const lastSetMs = new Date(params.lastSetCompletedAt).getTime();
  const bufferMs = (params.plannedRestSeconds ?? 60) * 1000;
  const endedMs = lastSetMs + bufferMs;

  return new Date(endedMs).toISOString();
}

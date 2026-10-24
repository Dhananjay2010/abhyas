import { localDateString } from "../dates";

/**
 * Calculate elapsed seconds for the runner's clock display.
 *
 * For normal sessions, counts from started_at to now.
 * For stale sessions (past-day or >3h idle), caps the display at the duration
 * up to the last logged set to avoid showing unrealistic times like 1440:35.
 *
 * @param params.startedAt - When the session was started (ISO string)
 * @param params.now - Current time (ISO string)
 * @param params.lastSetCompletedAt - When the last set was logged (ISO string or null)
 * @param params.workingSetCount - Number of working sets logged
 * @param params.timezone - User's timezone (IANA string)
 * @param params.sessionLocalDate - The session's local date (YYYY-MM-DD)
 * @param params.plannedRestSeconds - Planned rest between sets (or default 60s)
 * @returns Elapsed seconds to display on the clock
 */
export function runnerClockSeconds(params: {
  startedAt: string;
  now: string;
  lastSetCompletedAt: string | null;
  workingSetCount: number;
  timezone: string;
  sessionLocalDate: string;
  plannedRestSeconds?: number | null;
}): number {
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

  // Normal session: count from started_at to now
  if (!isStale) {
    return Math.floor((nowMs - startedMs) / 1000);
  }

  // Stale session: cap at last set + buffer (or 0 if no sets)
  if (!params.lastSetCompletedAt) {
    return 0;
  }

  const lastSetMs = new Date(params.lastSetCompletedAt).getTime();
  const bufferMs = (params.plannedRestSeconds ?? 60) * 1000;
  const cappedMs = lastSetMs + bufferMs - startedMs;

  return Math.max(0, Math.floor(cappedMs / 1000));
}

import { localDateString } from "../dates";

/**
 * Determine if a session is stale (started on a past day or idle > 3 hours).
 *
 * A stale session should use resolveStaleFinish instead of now-based timing.
 *
 * @param params.startedAt - When the session was started (ISO string)
 * @param params.now - Current time (ISO string)
 * @param params.timezone - User's timezone (IANA string)
 * @returns true if the session is stale
 */
export function isStaleSession(params: {
  startedAt: string;
  now: string;
  timezone: string;
}): boolean {
  const startMs = new Date(params.startedAt).getTime();
  const nowMs = new Date(params.now).getTime();

  // Stale if started on a past day (in user's timezone)
  const startedLocalDate = localDateString(params.timezone, new Date(params.startedAt));
  const todayLocalDate = localDateString(params.timezone, new Date(params.now));

  if (startedLocalDate < todayLocalDate) {
    return true;
  }

  // Stale if more than 3 hours have passed
  const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
  if (nowMs - startMs > THREE_HOURS_MS) {
    return true;
  }

  return false;
}

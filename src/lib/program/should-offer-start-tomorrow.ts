/**
 * Decide whether to offer the "Or start tomorrow" link.
 * 
 * Only shown for brand-new plans (block 1) on their first day (started_on),
 * when no session has been started yet, and when the local time is 20:00 or later.
 */
export function shouldOfferStartTomorrow({
  isFirstDay,
  sessionStarted,
  localHour,
}: {
  /** True when today is the program's started_on date */
  isFirstDay: boolean;
  /** True when any session is in_progress or completed */
  sessionStarted: boolean;
  /** The current local hour (0-23) in the user's timezone */
  localHour: number;
}): boolean {
  if (!isFirstDay) return false;
  if (sessionStarted) return false;
  return localHour >= 20;
}

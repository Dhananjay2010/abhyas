import { resolveTimezoneWithProfile } from "@/lib/timezone";

/**
 * Get today's date as ISO string (YYYY-MM-DD) in the given timezone.
 * 
 * Uses the user's timezone to avoid off-by-one errors when server runs in UTC.
 * 
 * @param timezone - User's timezone (null falls back to branding default)
 * @param now - The instant to format (defaults to current time, injectable for testing)
 * @returns ISO date string (YYYY-MM-DD) in the target timezone
 * 
 * @example
 * // At 2026-10-24T20:00:00Z:
 * getTodayIsoInTimezone('Asia/Kolkata')  // returns '2026-10-25' (IST +5:30 offset makes it next day)
 * getTodayIsoInTimezone('UTC')           // returns '2026-10-24' (same day in UTC)
 * getTodayIsoInTimezone(null)            // uses branding default timezone
 */
export function getTodayIsoInTimezone(
  timezone: string | null,
  now: Date = new Date()
): string {
  const resolved = resolveTimezoneWithProfile(timezone);
  
  // Use Intl.DateTimeFormat to get date parts in user's timezone
  // en-CA locale produces YYYY-MM-DD format directly
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolved,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  return formatter.format(now);
}

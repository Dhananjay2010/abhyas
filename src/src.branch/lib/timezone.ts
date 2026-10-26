/**
 * Timezone resolution for per-gym branding.
 *
 * Priority order:
 * 1. User's profile timezone (if explicitly set)
 * 2. Gym's configured timezone (from branding config)
 * 3. Browser-detected timezone (recorded during onboarding)
 * 4. Fallback to Asia/Kolkata (last resort)
 *
 * Note: The profiles.timezone column is nullable. NULL means "not set yet",
 * and the application falls back to gym → browser → fallback timezone.
 * Any stored value (including 'Asia/Kolkata') is treated as an explicit
 * user preference.
 *
 * SSR-safe: server renders with profile/gym/fallback timezone, client can
 * detect and record browser timezone during onboarding.
 */

import { branding, validateTimezone } from "./branding";

/**
 * Last-resort timezone fallback when all other methods fail.
 * Chosen for backwards compatibility with existing data.
 */
export const FALLBACK_TIMEZONE = "Asia/Kolkata";

/**
 * Detect the user's timezone from their browser.
 * Only works client-side; returns null on the server.
 */
export function detectBrowserTimezone(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validateTimezone(detected);
  } catch {
    return null;
  }
}

/**
 * Get the default timezone for this gym deployment.
 * Returns the brand's configured timezone, or the fallback if not set.
 * This is the timezone used during SSR and as a fallback when browser
 * detection fails.
 */
export function getDefaultTimezone(): string {
  return branding.timezone || FALLBACK_TIMEZONE;
}

/**
 * Resolve timezone with user profile timezone as highest priority.
 * Use this in server components that have access to the user's profile.
 *
 * Priority:
 * 1. User's profile timezone (if set and valid)
 * 2. Gym's configured timezone (from branding)
 * 3. Asia/Kolkata (fallback)
 *
 * NULL or invalid profile timezone falls back to gym timezone, then FALLBACK_TIMEZONE.
 * Any stored value (including 'Asia/Kolkata') is treated as an explicit preference.
 *
 * @param profileTimezone - The timezone from user's profile (profiles.timezone)
 */
export function resolveTimezoneWithProfile(
  profileTimezone: string | null | undefined
): string {
  // Validate profile timezone
  const validated = validateTimezone(profileTimezone);
  
  // If profile has a valid timezone, use it (it's an explicit preference)
  if (validated) {
    return validated;
  }
  
  // Profile is NULL or invalid, fall back to gym timezone or system default
  return getDefaultTimezone();
}

/**
 * Format a Date object as a localized string in the given timezone.
 * Useful for displaying times to users.
 *
 * @example
 * formatInTimezone(new Date(), 'America/New_York', { 
 *   dateStyle: 'medium', 
 *   timeStyle: 'short' 
 * })
 * // => "Jan 15, 2026, 3:30 PM"
 */
export function formatInTimezone(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...options,
  }).format(date);
}

/**
 * Convert a UTC ISO string to date and time strings in the given timezone.
 * Returns date in YYYY-MM-DD format and time in HH:MM format.
 * 
 * @param utcIsoString - UTC ISO timestamp (e.g., "2026-08-31T13:14:00Z")
 * @param timezone - IANA timezone name (e.g., "Asia/Kolkata")
 * @returns Object with date (YYYY-MM-DD) and time (HH:MM) in the timezone
 * 
 * @example
 * utcToZonedDateTime("2026-08-31T13:14:00Z", "Asia/Kolkata")
 * // => { date: "2026-08-31", time: "18:44" }
 */
export function utcToZonedDateTime(
  utcIsoString: string,
  timezone: string
): { date: string; time: string } {
  const date = new Date(utcIsoString);
  
  // Get date parts in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const partsMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  
  const zonedDate = `${partsMap.year}-${partsMap.month}-${partsMap.day}`;
  const zonedTime = `${partsMap.hour}:${partsMap.minute}`;
  
  return { date: zonedDate, time: zonedTime };
}

/**
 * Convert a date string and time string in a specific timezone to a UTC ISO timestamp.
 * Properly handles DST transitions.
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @param timeString - Time in HH:MM format (24-hour)
 * @param timezone - IANA timezone name (e.g., "Asia/Kolkata")
 * @returns UTC ISO timestamp string
 * 
 * @example
 * zonedDateTimeToUtc("2026-08-31", "18:44", "Asia/Kolkata")
 * // => "2026-08-31T13:14:00.000Z"
 */
export function zonedDateTimeToUtc(
  dateString: string,
  timeString: string,
  timezone: string
): string {
  // Parse the input
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = timeString.split(":").map(Number);
  
  // Create a date string that we want to interpret in the target timezone
  // We'll use a simpler approach: use toLocaleString with the timezone to find the offset
  
  // Start with a rough estimate: create a Date as if the input was UTC
  const roughDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  
  // Now we need to find what UTC time produces this local time in the target timezone
  // Strategy: We'll use the offset at this approximate time
  
  // Get the offset by formatting a nearby date and comparing
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  // Helper to extract components from a UTC timestamp
  const getLocalComponents = (utcTimestamp: number) => {
    const d = new Date(utcTimestamp);
    const parts = formatter.formatToParts(d);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return {
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10),
      day: parseInt(map.day, 10),
      hour: parseInt(map.hour, 10),
      minute: parseInt(map.minute, 10),
      second: parseInt(map.second, 10),
    };
  };
  
  // Binary search for the exact UTC timestamp that produces our target local time
  // Search window: +/- 24 hours from rough estimate
  let low = roughDate.getTime() - 24 * 60 * 60 * 1000;
  let high = roughDate.getTime() + 24 * 60 * 60 * 1000;
  
  const target = { year, month, day, hour, minute };
  
  // Binary search with minute precision
  while (high - low > 60000) { // Stop when we're within 1 minute
    const mid = Math.floor((low + high) / 2);
    const local = getLocalComponents(mid);
    
    // Compare target with actual
    if (local.year < target.year ||
        (local.year === target.year && local.month < target.month) ||
        (local.year === target.year && local.month === target.month && local.day < target.day) ||
        (local.year === target.year && local.month === target.month && local.day === target.day && local.hour < target.hour) ||
        (local.year === target.year && local.month === target.month && local.day === target.day && local.hour === target.hour && local.minute < target.minute)) {
      low = mid + 1;
    } else if (local.year > target.year ||
        (local.year === target.year && local.month > target.month) ||
        (local.year === target.year && local.month === target.month && local.day > target.day) ||
        (local.year === target.year && local.month === target.month && local.day === target.day && local.hour > target.hour) ||
        (local.year === target.year && local.month === target.month && local.day === target.day && local.hour === target.hour && local.minute > target.minute)) {
      high = mid - 1;
    } else {
      // Found exact match
      // Round to start of minute and set seconds to 0
      const result = new Date(mid);
      result.setUTCSeconds(0);
      result.setUTCMilliseconds(0);
      return result.toISOString();
    }
  }
  
  // Find the closest match in the remaining range
  let best = low;
  let bestDiff = Infinity;
  
  for (let ts = low; ts <= high; ts += 60000) { // Check every minute
    const local = getLocalComponents(ts);
    if (local.year === target.year && 
        local.month === target.month && 
        local.day === target.day && 
        local.hour === target.hour && 
        local.minute === target.minute) {
      const result = new Date(ts);
      result.setUTCSeconds(0);
      result.setUTCMilliseconds(0);
      return result.toISOString();
    }
    
    const diff = Math.abs(
      (local.year - target.year) * 525600 +
      (local.month - target.month) * 43800 +
      (local.day - target.day) * 1440 +
      (local.hour - target.hour) * 60 +
      (local.minute - target.minute)
    );
    
    if (diff < bestDiff) {
      bestDiff = diff;
      best = ts;
    }
  }
  
  const result = new Date(best);
  result.setUTCSeconds(0);
  result.setUTCMilliseconds(0);
  return result.toISOString();
}

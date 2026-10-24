/**
 * Timezone resolution for per-gym branding.
 *
 * Priority order:
 * 1. User's profile timezone (if explicitly set and NOT the database default)
 * 2. Gym's configured timezone (from branding config)
 * 3. Browser-detected timezone (recorded during onboarding)
 * 4. Fallback to Asia/Kolkata (last resort)
 *
 * Note: The profiles.timezone column defaults to 'Asia/Kolkata' in the database.
 * During onboarding, we overwrite this with browser-detected timezone if available.
 * If a gym has a configured timezone and the profile still has the default value,
 * the gym timezone takes priority over the database default.
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
 * 1. User's profile timezone (if set, valid, and NOT the default fallback)
 * 2. Gym's configured timezone (from branding) - wins over database default
 * 3. Asia/Kolkata (fallback)
 *
 * Special handling: If profile timezone equals FALLBACK_TIMEZONE ('Asia/Kolkata')
 * and the gym has a configured timezone, the gym timezone takes priority. This
 * ensures gym-specific timezones work even though the database column defaults
 * to 'Asia/Kolkata'.
 *
 * @param profileTimezone - The timezone from user's profile (profiles.timezone)
 */
export function resolveTimezoneWithProfile(
  profileTimezone: string | null | undefined
): string {
  // Validate profile timezone
  const validated = validateTimezone(profileTimezone);
  
  // If profile has a valid timezone that's NOT the fallback, use it
  // (User explicitly set it or it was captured from browser during onboarding)
  if (validated && validated !== FALLBACK_TIMEZONE) {
    return validated;
  }
  
  // If profile has the fallback but gym has a configured timezone, prefer gym
  // (This handles the case where the database default hasn't been updated yet)
  if (validated === FALLBACK_TIMEZONE && branding.timezone) {
    return branding.timezone;
  }
  
  // Fall back to default (gym timezone or FALLBACK_TIMEZONE)
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

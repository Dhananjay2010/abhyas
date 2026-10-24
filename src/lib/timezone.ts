/**
 * Timezone resolution for per-gym branding.
 *
 * Priority order:
 * 1. User's profile timezone (profiles.timezone)
 * 2. Gym's configured timezone (from branding config)
 * 3. Browser-detected timezone (recorded during onboarding)
 * 4. Fallback to Asia/Kolkata (last resort)
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
 * @param profileTimezone - The timezone from user's profile (profiles.timezone)
 */
export function resolveTimezoneWithProfile(
  profileTimezone: string | null | undefined
): string {
  // User's saved timezone takes priority
  const validated = validateTimezone(profileTimezone);
  if (validated) return validated;

  // Fall back to gym default
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

/**
 * Timezone resolution for per-gym branding.
 *
 * Priority order:
 * 1. Gym's configured timezone (from branding config)
 * 2. User's browser timezone (client-side detection via Intl API)
 * 3. Fallback to Asia/Kolkata (existing default)
 *
 * SSR-safe: server renders with gym/fallback timezone, client hydrates with
 * detected timezone. Components that display timezone-sensitive dates must
 * handle this gracefully (e.g., suppressHydrationWarning on date strings).
 */

import { branding, validateTimezone } from "./branding";

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
 * Returns the brand's configured timezone, or Asia/Kolkata if not set.
 * This is the timezone used during SSR and as a fallback when browser
 * detection fails.
 */
export function getDefaultTimezone(): string {
  return branding.timezone || "Asia/Kolkata";
}

/**
 * Resolve the effective timezone for the current context.
 *
 * Client-side: uses browser-detected timezone if available, falls back to
 * gym default, then Asia/Kolkata.
 *
 * Server-side: uses gym default or Asia/Kolkata (browser detection unavailable).
 *
 * This function is safe for both SSR and client rendering, but be aware that
 * the result may differ between server and client. Components displaying
 * timezone-sensitive dates should use suppressHydrationWarning.
 */
export function resolveTimezone(): string {
  const browser = detectBrowserTimezone();
  if (browser) return browser;
  return getDefaultTimezone();
}

/**
 * Resolve timezone with user profile timezone as highest priority.
 * Use this in server components that have access to the user's profile.
 *
 * Priority:
 * 1. User's profile timezone (if set and valid)
 * 2. Gym's configured timezone (from branding)
 * 3. Asia/Kolkata (existing default)
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

/**
 * Timezone patch sanitization for user settings updates.
 *
 * Ensures that only valid, canonical IANA timezone identifiers (or null for gym default)
 * are written to the database, preventing RangeError from malformed values.
 *
 * Canonicalizes valid timezones: fixes case, maps legacy aliases (Asia/Calcutta → Asia/Kolkata),
 * and rejects abbreviations (EST, PST) and offsets (+05:30).
 */

import { canonicalizeTimezone } from "@/lib/timezone-canonical";

type SanitizeResult =
  | { ok: true; timezone: string | null }
  | { ok: false; error: string };

/**
 * Sanitize and canonicalize a timezone value from user input before persisting it.
 *
 * - `null`: allowed (means "use gym default")
 * - Valid IANA timezone string: canonicalized and stored (e.g., "asia/kolkata" → "Asia/Kolkata")
 * - Invalid or malformed string: rejected with an error message
 *
 * @param value - The timezone value from user input (null or string)
 * @returns A result object with either the canonical timezone or an error
 *
 * @example
 * sanitizeTimezonePatch("america/new_york")  // => { ok: true, timezone: "America/New_York" }
 * sanitizeTimezonePatch("Asia/Calcutta")     // => { ok: true, timezone: "Asia/Kolkata" }
 * sanitizeTimezonePatch(null)                // => { ok: true, timezone: null }
 * sanitizeTimezonePatch("EST")               // => { ok: false, error: "..." }
 */
export function sanitizeTimezonePatch(
  value: string | null | undefined
): SanitizeResult {
  // null or undefined means "use gym default" — always allowed
  if (value == null) {
    return { ok: true, timezone: null };
  }

  // Canonicalize non-null string
  const canonical = canonicalizeTimezone(value);
  if (canonical) {
    return { ok: true, timezone: canonical };
  }

  // Invalid timezone string
  return {
    ok: false,
    error: "Invalid timezone. Please select a valid timezone from the list.",
  };
}

/**
 * Timezone canonicalization for user input.
 *
 * Converts user-provided timezone strings to canonical IANA names:
 * - Trims whitespace
 * - Fixes case (asia/kolkata → Asia/Kolkata)
 * - Maps legacy aliases to current names (Asia/Calcutta → Asia/Kolkata)
 * - Rejects abbreviations (EST, PST, IST, CET)
 * - Rejects offsets (+05:30, GMT+5)
 * - Rejects invalid or malformed timezones
 */

/**
 * Legacy timezone aliases that should be mapped to current canonical names.
 * ICU often keeps legacy names for compatibility, but we normalize them.
 * Applied AFTER case canonicalization.
 */
const LEGACY_ALIASES: Record<string, string> = {
  // South Asian renames
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",

  // European renames
  "Europe/Kiev": "Europe/Kyiv",

  // American renames
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",

  // US zone shortcuts (deprecated)
  "US/Eastern": "America/New_York",
  "US/Central": "America/Chicago",
  "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles",
  "US/Hawaii": "Pacific/Honolulu",

  // GMT/UTC variants
  "GMT": "UTC",
  "Etc/GMT": "UTC",
  "Etc/UTC": "UTC",
};

/**
 * Canonicalize a timezone string to the current IANA name.
 * Returns the canonical name, or null if the input is invalid.
 *
 * Process:
 * 1. Trim whitespace
 * 2. Reject if over 64 characters
 * 3. Use Intl to validate and fix case
 * 4. Apply legacy alias mapping
 * 5. Reject abbreviations (no '/' except exactly 'UTC')
 * 6. Reject offsets ('+05:30', 'GMT+5')
 *
 * @param input - The timezone string from user input
 * @returns The canonical IANA name, or null if invalid
 *
 * @example
 * canonicalizeTimezone("asia/kolkata")         // => "Asia/Kolkata"
 * canonicalizeTimezone("Asia/Calcutta")        // => "Asia/Kolkata"
 * canonicalizeTimezone("US/Pacific")           // => "America/Los_Angeles"
 * canonicalizeTimezone("UTC")                  // => "UTC"
 * canonicalizeTimezone("EST")                  // => null (abbreviation)
 * canonicalizeTimezone("+05:30")               // => null (offset)
 * canonicalizeTimezone("Mars/Olympus")         // => null (invalid)
 */
export function canonicalizeTimezone(input: string): string | null {
  // Trim whitespace
  const trimmed = input.trim();

  // Reject empty string
  if (!trimmed) return null;

  // Reject overly long strings (max 64 chars for any valid IANA zone)
  if (trimmed.length > 64) return null;

  // Reject offset formats at input level
  // - Starts with +/- like "+05:30", "-08:00"
  // - GMT/UTC offset formats like "GMT+5", "UTC-8", "Etc/GMT+5"
  if (/^[+-]/.test(trimmed) || /^(Etc\/)?(GMT|UTC)[+-]\d/i.test(trimmed)) {
    return null;
  }

  // Reject abbreviations BEFORE Intl validation
  // Intl accepts abbreviations (EST, PST, IST) and resolves them to full names,
  // but we want to reject them to force users to select proper IANA names
  // Allow inputs that:
  // - Are 'UTC' (case-insensitive)
  // - Contain a '/' (proper IANA format)
  // - Are in our legacy alias table (case-insensitive check)
  const trimmedUpper = trimmed.toUpperCase();
  const hasAliasMatch = Object.keys(LEGACY_ALIASES).some(
    (key) => key.toUpperCase() === trimmedUpper
  );

  if (trimmedUpper !== "UTC" && !trimmed.includes("/") && !hasAliasMatch) {
    return null;
  }

  // Use Intl to validate and get the case-corrected version
  let caseCorrected: string;
  try {
    const resolved = new Intl.DateTimeFormat("en-US", {
      timeZone: trimmed,
    }).resolvedOptions().timeZone;
    caseCorrected = resolved;
  } catch {
    // Intl rejected it (invalid timezone)
    return null;
  }

  // Apply legacy alias mapping
  const canonical = LEGACY_ALIASES[caseCorrected] ?? caseCorrected;

  // Reject offset formats in the canonical result
  // Etc/GMT+5, Etc/GMT-14, etc. can pass Intl but aren't location-based
  if (/^(Etc\/)?(GMT|UTC)[+-]\d/i.test(canonical)) {
    return null;
  }

  // Final check: canonical result must have '/' or be exactly 'UTC'
  // (Should always pass if pre-check and mapping worked correctly)
  if (canonical !== "UTC" && !canonical.includes("/")) {
    return null;
  }

  return canonical;
}

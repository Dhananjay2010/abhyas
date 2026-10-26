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
 * Applied case-insensitively to both raw input and Intl-resolved names.
 */
const LEGACY_ALIASES: Record<string, string> = {
  // All UTC-equivalent names map to UTC
  "UTC": "UTC",
  "Etc/UTC": "UTC",
  "GMT": "UTC",
  "Etc/GMT": "UTC",
  "Etc/GMT0": "UTC",
  "GMT0": "UTC",
  "Etc/GMT-0": "UTC",
  "Etc/GMT+0": "UTC",
  "GMT-0": "UTC",
  "GMT+0": "UTC",
  "Etc/Universal": "UTC",
  "Universal": "UTC",
  "Etc/Zulu": "UTC",
  "Zulu": "UTC",
  "Greenwich": "UTC",
  "Etc/Greenwich": "UTC",
  "UCT": "UTC",
  "Etc/UCT": "UTC",

  // South Asian renames
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",

  // European renames
  "Europe/Kiev": "Europe/Kyiv",

  // American renames
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",

  // Legacy ICU names (Node 20 returns these from Intl.resolvedOptions)
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Godthab": "America/Nuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",

  // US zone shortcuts (deprecated)
  "US/Eastern": "America/New_York",
  "US/Central": "America/Chicago",
  "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles",
  "US/Hawaii": "Pacific/Honolulu",
};

/**
 * Case-insensitive alias lookup.
 */
function lookupAlias(name: string): string | undefined {
  const upper = name.toUpperCase();
  for (const [key, value] of Object.entries(LEGACY_ALIASES)) {
    if (key.toUpperCase() === upper) {
      return value;
    }
  }
  return undefined;
}

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
  // BUT allow zero-offset forms: GMT-0, GMT+0, Etc/GMT-0, Etc/GMT+0
  if (/^[+-]/.test(trimmed)) {
    return null;
  }
  if (/^(Etc\/)?(GMT|UTC)[+-]\d/i.test(trimmed)) {
    // Check if it's a zero-offset form (GMT±0, Etc/GMT±0, etc.)
    if (!/^(Etc\/)?(GMT|UTC)[+-]0+$/i.test(trimmed)) {
      return null;
    }
  }

  // Reject abbreviations BEFORE Intl validation
  // Intl accepts abbreviations (EST, PST, IST) and resolves them to full names,
  // but we want to reject them to force users to select proper IANA names
  // Allow inputs that:
  // - Are 'UTC' or a UTC-equivalent in our alias table (case-insensitive)
  // - Contain a '/' (proper IANA format)
  // - Are in our legacy alias table (case-insensitive check)
  const hasAliasMatch = !!lookupAlias(trimmed);

  if (!hasAliasMatch && !trimmed.includes("/")) {
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

  // Apply legacy alias mapping (case-insensitive, check both input and resolved)
  // First check if the input itself maps to a canonical name
  const inputAlias = lookupAlias(trimmed);
  if (inputAlias) {
    // Verify the canonical output is valid
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: inputAlias });
      return inputAlias;
    } catch {
      // Fall through to use caseCorrected
    }
  }
  
  // Then check if the Intl-resolved name needs mapping
  const resolvedAlias = lookupAlias(caseCorrected);
  const canonical = resolvedAlias ?? caseCorrected;

  // Reject offset formats in the canonical result
  // Etc/GMT+5, Etc/GMT-14, etc. can pass Intl but aren't location-based
  // BUT allow zero-offset forms
  if (/^(Etc\/)?(GMT|UTC)[+-]\d/i.test(canonical)) {
    if (!/^(Etc\/)?(GMT|UTC)[+-]0+$/i.test(canonical)) {
      return null;
    }
  }

  // Final check: canonical result must have '/' or be exactly 'UTC'
  if (canonical !== "UTC" && !canonical.includes("/")) {
    return null;
  }

  // Verify the canonical output is accepted by Intl
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: canonical });
  } catch {
    return null;
  }

  return canonical;
}

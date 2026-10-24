/**
 * Pure timezone picker logic for testing.
 * 
 * Extracted from timezone-picker.tsx to enable unit testing
 * without React component rendering.
 */

import { canonicalizeTimezone } from "@/lib/timezone-canonical";

/**
 * Compute display value for timezone picker.
 * 
 * QA Issue #6: A stored canonical timezone (Asia/Kolkata) must display as that zone,
 * never as "Gym default". Special display labels are only for:
 * - null/empty (no explicit choice) -> "Gym default (<zone>)"
 * - deviceZone match -> "Use this device's zone (<zone>)"
 * 
 * @param value - The stored timezone value (null or timezone string)
 * @param deviceZone - The detected browser timezone (canonical)
 * @param gymDefault - The gym's default timezone
 * @returns Display string for the input field
 */
export function getTimezoneDisplayValue(
  value: string | null,
  deviceZone: string | null,
  gymDefault: string
): string {
  // null or empty means no explicit choice -> show gym default
  if (value === null || value === "") {
    return `Gym default (${gymDefault})`;
  }
  
  // If value matches device zone, show special label
  if (deviceZone && value === deviceZone) {
    return `Use this device's zone (${deviceZone})`;
  }
  
  // Otherwise show the timezone as-is (canonical stored value)
  // QA fix: Asia/Kolkata displays as "Asia/Kolkata", not "Gym default"
  return value;
}

/**
 * Decide whether to commit or cancel on blur.
 * 
 * QA Issue #7: Escape key must CANCEL (restore previous, no onChange).
 * Blur caused by Escape must not commit.
 * 
 * @param editValue - The current text in the input
 * @param timezones - List of valid timezone options
 * @param deviceZone - The detected browser timezone
 * @param gymDefault - The gym's default timezone
 * @param cancelRequested - True if user pressed Escape
 * @returns Commit decision with the value to save or null to cancel
 */
export function decideTimezoneCommit(
  editValue: string,
  timezones: string[],
  deviceZone: string | null,
  gymDefault: string,
  cancelRequested: boolean
): { commit: true; value: string | null } | { commit: false } {
  // Escape key -> always cancel
  if (cancelRequested) {
    return { commit: false };
  }
  
  const trimmed = editValue.trim();
  
  // Check for special options
  if (deviceZone && (trimmed === `Use this device's zone (${deviceZone})` || trimmed === deviceZone)) {
    return { commit: true, value: deviceZone };
  }
  
  if (trimmed === `Gym default (${gymDefault})` || trimmed === "") {
    return { commit: true, value: null };
  }
  
  // Canonicalize input and check if canonical value is in the list
  const canonical = canonicalizeTimezone(trimmed);
  if (canonical && timezones.includes(canonical)) {
    return { commit: true, value: canonical };
  }
  
  // Also accept if typed value is already in the list (exact match)
  if (timezones.includes(trimmed)) {
    return { commit: true, value: trimmed };
  }
  
  // Invalid input -> don't commit
  return { commit: false };
}

/**
 * Server-side timezone list builder with canonical names.
 * 
 * Runtime bug fix: Canonicalize EVERY source name (from Intl.supportedValuesOf) 
 * so the options list contains only canonical values. This ensures that when a user 
 * selects "Asia/Calcutta" from a browser list, the stored canonicalized value 
 * "Asia/Kolkata" matches an option and appears selected.
 * 
 * (b) Build from canonical names merged with Intl.supportedValuesOf,
 * de-duplicated by alias using canonicalizeTimezone so Asia/Calcutta 
 * and Asia/Kolkata don't both appear. Prefer the canonical name.
 * (d) Built on server and passed as prop to avoid hydration mismatches.
 */

import { canonicalizeTimezone } from "./timezone-canonical";

/**
 * Build the complete timezone options list for the server.
 * 
 * QA-confirmed fix: Canonicalizes every source timezone name to ensure options 
 * list contains only canonical values that match what gets stored in the DB.
 * 
 * - Starts with Intl.supportedValuesOf("timeZone") 
 * - Canonicalizes each one (Asia/Calcutta → Asia/Kolkata, etc.)
 * - Deduplicates automatically via Set
 * - Always includes UTC explicitly
 * - Always includes the stored value (canonicalized) so it appears selected
 * 
 * This fixes the bug where saving "Asia/Calcutta" stores "Asia/Kolkata" but 
 * the picker shows no selection because "Asia/Kolkata" wasn't in the list.
 */
export function buildTimezoneOptions(storedTimezone: string | null): string[] {
  const intlZones = Intl.supportedValuesOf("timeZone");
  const merged = new Set<string>();
  
  // Always include UTC explicitly (fundamental timezone)
  merged.add("UTC");
  
  // Canonicalize EVERY zone from Intl to deduplicate aliases
  // This ensures options contain only canonical names
  for (const zone of intlZones) {
    const canonical = canonicalizeTimezone(zone);
    if (canonical) {
      merged.add(canonical);
    }
  }
  
  // ALWAYS include the stored timezone (canonicalized) even if not in Intl list
  // This ensures the stored value is selectable and appears selected
  if (storedTimezone) {
    const canonical = canonicalizeTimezone(storedTimezone);
    if (canonical) {
      merged.add(canonical);
    } else {
      // Stored timezone is invalid, but include it anyway so user can see it's selected
      // This handles legacy invalid data gracefully
      merged.add(storedTimezone);
    }
  }
  
  return Array.from(merged).sort();
}

/**
 * Server-side timezone list builder with canonical aliases.
 * 
 * V8's Intl.supportedValuesOf lists Asia/Calcutta and Europe/Kiev but not
 * the canonical names Europe/Kyiv or UTC. This builder merges supportedValuesOf
 * with canonical aliases to ensure common zones are available.
 */

import { FALLBACK_TIMEZONE } from "./timezone";

const CANONICAL_ALIASES = [
  FALLBACK_TIMEZONE,
  "Europe/Kyiv", 
  "UTC",
  "America/Argentina/Buenos_Aires",
  "Asia/Ho_Chi_Minh",
  "Asia/Kathmandu",
  "Asia/Yangon",
] as const;

/**
 * Build the complete timezone options list for the server.
 * Merges Intl.supportedValuesOf with canonical aliases, deduped and sorted.
 * Always includes the user's stored timezone if provided.
 */
export function buildTimezoneOptions(storedTimezone: string | null): string[] {
  const base = Intl.supportedValuesOf("timeZone");
  const merged = new Set([...base, ...CANONICAL_ALIASES]);
  
  // Always include the stored timezone even if not in any list
  if (storedTimezone) {
    merged.add(storedTimezone);
  }
  
  return Array.from(merged).sort();
}

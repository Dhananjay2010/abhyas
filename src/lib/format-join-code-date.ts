/**
 * Fixed-format date formatter for join code expiry dates.
 * 
 * Uses explicit locale ('en-GB') and timezone to prevent React hydration errors.
 * Server and client will output the same string.
 * 
 * Format: '27 Oct 2026' (day, short month, year)
 */

export function formatJoinCodeDate(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

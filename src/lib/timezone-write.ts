/**
 * Helper for deciding when to write a timezone value to profiles.timezone.
 *
 * Context: profiles.timezone is nullable. NULL means "not set yet" and the
 * application falls back to gym → browser → fallback timezone. Once a value
 * is stored (including 'Asia/Kolkata'), it's treated as an explicit preference.
 *
 * saveAboutYou receives a browserTimezone from the client on every submission.
 * If we wrote it unconditionally, a user who explicitly chose a different
 * timezone in Settings would have their choice overwritten back to the browser
 * zone the next time they edited their profile.
 *
 * Solution: write the timezone only when:
 * 1. The current value is NULL (not set yet), OR
 * 2. The user explicitly changed it in this request (e.g., from Settings)
 *
 * Note: both currentTimezone and incomingTimezone should be in canonical form
 * (via validateTimezone/canonicalizeTimezone) for accurate comparison.
 *
 * @param currentTimezone - The timezone currently stored in profiles.timezone (or null)
 * @param incomingTimezone - The timezone from the client (browser or user-selected)
 * @param explicitlyChanged - True if the user explicitly changed the timezone in this request
 * @returns true if the timezone should be written to the database
 */
export function shouldWriteTimezone(
  currentTimezone: string | null | undefined,
  incomingTimezone: string | null | undefined,
  explicitlyChanged: boolean
): boolean {
  // Always write if the user explicitly changed it
  if (explicitlyChanged) {
    return true;
  }

  // Only write browser-detected timezone if the current value is NULL (not set yet)
  // If they already have a timezone (including 'Asia/Kolkata'), respect it
  return !currentTimezone;
}

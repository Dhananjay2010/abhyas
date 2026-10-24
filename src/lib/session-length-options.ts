/**
 * Session length options for Settings and validation.
 *
 * Single source of truth for allowed preferred_session_minutes values.
 * Must stay in sync with any DB check constraint on profiles.preferred_session_minutes.
 */

export const SESSION_LENGTH_OPTIONS = [30, 45, 60, 75] as const;

export type SessionLength = (typeof SESSION_LENGTH_OPTIONS)[number];

export function isValidSessionLength(value: unknown): value is SessionLength {
  return (
    typeof value === "number" &&
    SESSION_LENGTH_OPTIONS.includes(value as SessionLength)
  );
}

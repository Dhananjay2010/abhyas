/**
 * Friendly error messages from plan-day-core that should pass through unchanged.
 */
export const CORE_FRIENDLY_ERRORS = [
  "You already planned this day.",
  "That day isn't in your block.",
  "Session has already started.",
  "That is not a date.",
  "That day has already been and gone.",
  "That day is already done.",
  "That session has already started.",
  "No active program.",
  "Could not find program day.",
] as const;

const GENERIC_ERROR = "Couldn't save your choice. Please try again.";

/**
 * Map raw database errors to user-friendly messages.
 * 
 * Allowlist: only the core's own friendly messages pass through unchanged.
 * Everything else (RLS, JWT expired, TypeError, permission denied, timeouts, etc.)
 * maps to a generic error.
 */
export function friendlyPlanDayError(error: string): string {
  if ((CORE_FRIENDLY_ERRORS as readonly string[]).includes(error)) {
    return error;
  }
  return GENERIC_ERROR;
}

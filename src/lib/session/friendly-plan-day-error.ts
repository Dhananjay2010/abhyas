/**
 * Friendly error messages from plan-day-core that should pass through unchanged.
 */
export const CORE_FRIENDLY_ERRORS: readonly string[] = [
  // plan-day-core.ts
  "That is not a date.",
  "That day has already been and gone.",
  "That day is already done.",
  "That session has already started.",
  "No active program.",
  "Could not find program day.",
  // load-plan-day.ts (via loadProgramDay)
  "Could not load the training block.",
  "That day is not in your block.",
];

export const GENERIC_PLAN_DAY_ERROR = "Couldn't save your choice. Please try again.";

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
  return GENERIC_PLAN_DAY_ERROR;
}

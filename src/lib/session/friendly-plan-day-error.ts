/**
 * Map raw database errors to user-friendly messages.
 */
export function friendlyPlanDayError(error: string): string {
  if (error.includes("constraint") || error.includes("duplicate") || error.includes("unique")) {
    return "Couldn't save your choice. Please try again.";
  }
  return error;
}

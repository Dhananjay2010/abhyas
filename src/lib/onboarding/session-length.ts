/**
 * Session length options for workout planning
 */

export const SESSION_LENGTH_OPTIONS = [30, 45, 60, 75] as const;
export const DEFAULT_SESSION_LENGTH = 45;

export function isAllowedSessionLength(value: unknown): boolean {
  return typeof value === "number" && SESSION_LENGTH_OPTIONS.includes(value as 30 | 45 | 60 | 75);
}

export function getSessionLengthErrorMessage(): string {
  return "Pick 30, 45, 60 or 75 minutes.";
}

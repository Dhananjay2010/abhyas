export const SESSION_LENGTH_OPTIONS = [30, 45, 60, 75] as const;
export const DEFAULT_SESSION_LENGTH = 45;

export function isAllowedSessionLength(n: unknown): n is 30 | 45 | 60 | 75 {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    !Number.isNaN(n) &&
    SESSION_LENGTH_OPTIONS.includes(n as 30 | 45 | 60 | 75)
  );
}

export const SESSION_LENGTH_OPTIONS = [30, 45, 60, 75] as const;
export const DEFAULT_SESSION_LENGTH = 45;

export type SessionLength = (typeof SESSION_LENGTH_OPTIONS)[number];

export function isAllowedSessionLength(n: unknown): n is 30 | 45 | 60 | 75 {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    !Number.isNaN(n) &&
    SESSION_LENGTH_OPTIONS.some((o) => o === n)
  );
}

export type SessionLengthWriter = (
  minutes: 30 | 45 | 60 | 75
) => PromiseLike<{ error: { message: string } | null }>;

export async function persistSessionLength(
  write: SessionLengthWriter,
  minutes: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedSessionLength(minutes)) {
    return { ok: false, error: "Pick 30, 45, 60 or 75 minutes." };
  }

  const { error } = await write(minutes);

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Session length step logic: determines if step is "done"
 * 
 * M2 QA fix: The step is only done when sessionMinutes is explicitly saved (non-null).
 * This ensures reloading /onboarding lands on the session-length step until the user
 * explicitly chooses and saves a value, even though the UI preselects DEFAULT_SESSION_LENGTH.
 */
export type SessionLengthInitialState = {
  disclaimerAccepted: boolean;
  dateOfBirth: string | null;
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: string | null;
  level: string | null;
  primaryTrack: string | null;
  daysPerWeek: number | null;
  sessionMinutes: number | null; // null = not explicitly saved
};

/**
 * Compute the initial step index for onboarding flow.
 * 
 * M2 QA fix: Step 6 (session-length) is only done when sessionMinutes is non-null.
 * A null value means the user hasn't explicitly saved their choice yet, even though
 * the UI will preselect DEFAULT_SESSION_LENGTH (45).
 */
export function initialStepIndex(initial: SessionLengthInitialState): number {
  if (!initial.disclaimerAccepted) return 0;
  if (!initial.dateOfBirth || !initial.sex || !initial.heightCm || !initial.weightKg) return 1;
  if (!initial.goal) return 2;
  if (!initial.level) return 3;
  if (!initial.primaryTrack) return 4;
  if (!initial.daysPerWeek) return 5;
  if (!initial.sessionMinutes) return 6; // null means not explicitly saved (M2 QA fix)
  return 7;
}

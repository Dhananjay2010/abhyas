export const SESSION_LENGTH_OPTIONS = [30, 45, 60, 75] as const;
export const DEFAULT_SESSION_LENGTH = 45;

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

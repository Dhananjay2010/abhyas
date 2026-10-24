/**
 * Auth result handling for server actions.
 * 
 * Extracted from server actions to avoid exporting non-async-function values
 * from 'use server' files.
 */

import type { Result } from "@/app/session/actions";

export const SESSION_EXPIRED_CODE = "SESSION_EXPIRED";

/**
 * Resolve auth for a server action.
 * 
 * Returns SESSION_EXPIRED code when no user, instead of throwing. Used by
 * logSet and other server actions to handle auth failures without throwing.
 */
export async function resolveAuth<T>(
  authFn: () => Promise<{ user: unknown | null }>,
  action: () => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    const { user } = await authFn();
    if (!user) {
      return { ok: false, error: "Not signed in", code: SESSION_EXPIRED_CODE };
    }
    return await action();
  } catch (err) {
    if (err instanceof Error && err.message === "Not signed in") {
      return { ok: false, error: "Not signed in", code: SESSION_EXPIRED_CODE };
    }
    throw err;
  }
}

/**
 * Auth result handling for server actions.
 * 
 * Extracted from server actions to avoid exporting non-async-function values
 * from 'use server' files.
 */

import { SESSION_EXPIRED_CODE } from "@/lib/auth/session-expired";

export { SESSION_EXPIRED_CODE };

/**
 * Resolve auth for a server action.
 * 
 * Returns SESSION_EXPIRED code when no user, instead of throwing. Used by
 * logSet and other server actions to handle auth failures without throwing.
 */
export async function resolveAuth<TAuth, TResult>(
  authFn: () => Promise<TAuth & { user: unknown | null }>,
  action: (auth: TAuth) => Promise<TResult>,
): Promise<TResult | { ok: false; error: string; code: string }> {
  try {
    const auth = await authFn();
    if (!auth.user) {
      return { ok: false, error: "Not signed in", code: SESSION_EXPIRED_CODE };
    }
    return await action(auth);
  } catch (err) {
    if (err instanceof Error && err.message === "Not signed in") {
      return { ok: false, error: "Not signed in", code: SESSION_EXPIRED_CODE };
    }
    throw err;
  }
}

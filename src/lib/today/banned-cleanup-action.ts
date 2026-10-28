/**
 * Today's on-demand persistence of the banned-exercise cleanup.
 *
 * Extracted from src/app/today/actions.ts (cleanBannedExercises) and
 * src/app/today/cleanup-trigger.tsx so both steps can be tested against a
 * real supabase-js client (scripts/helpers/fake-postgrest.ts) without a
 * Next.js runtime. The Server Action and the client trigger are one-line
 * calls into these functions; their Next-only pieces (auth cookies, rate
 * limit headers, revalidatePath) are passed in.
 *
 * W6 action mutants target the calls below.
 */

export type BannedCleanupResult = { ok: true; cleaned: number } | { ok: false; error: string };

export type BannedCleanupActionDeps<C> = {
  getAuthedClient: () => Promise<{ supabase: C; user: { id: string } | null }>;
  checkRateLimit: () => Promise<{ ok: true } | { ok: false; error: string } | null>;
  clean: (supabase: C, userId: string) => Promise<{ cleaned: number; errors: string[] }>;
  revalidate: () => void;
};

/**
 * Clean banned exercises from planned workouts (on-demand persistence).
 * Same order as the Server Action always had: auth, rate limit, clean,
 * fail on the first error, then revalidate.
 */
export async function runBannedCleanupAction<C>(deps: BannedCleanupActionDeps<C>): Promise<BannedCleanupResult> {
  const { supabase, user } = await deps.getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const rateLimit = await deps.checkRateLimit();
  if (rateLimit && !rateLimit.ok) return rateLimit;

  const result = await deps.clean(supabase, user.id);
  if (result.errors.length > 0) {
    return { ok: false, error: result.errors[0] };
  }

  deps.revalidate();
  return { ok: true, cleaned: result.cleaned };
}

/**
 * Client-side trigger: run the cleanup only when the in-memory clean during
 * SSR found changes. Fire-and-forget for the caller (errors go to onError);
 * the promise is returned so a test can await it, and null when nothing ran.
 */
export function fireBannedCleanupIfNeeded(
  shouldClean: boolean,
  runCleanup: () => Promise<unknown>,
  onError: (error: unknown) => void,
): Promise<unknown> | null {
  if (!shouldClean) return null;
  return runCleanup().catch(onError);
}

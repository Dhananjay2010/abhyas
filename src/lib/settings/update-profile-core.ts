/**
 * Core settings update logic extracted from server action
 */

import { shouldResetProgressionTargets } from "../program/reset-decision";
import { resetProgressionTargets } from "../program/progression";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export async function updateProfileCore(
  deps: { supabase: SupabaseClient; userId: string },
  patch: Record<string, unknown>
) {
  const { supabase, userId } = deps;

  const currentProfileRes = await supabase.from("profiles").select("goal, level, days_per_week, primary_track").eq("id", userId).single();

  const currentProfile = currentProfileRes.data as {
    goal: string | null;
    level: string | null;
    days_per_week: number | null;
    primary_track: string | null;
  } | null;

  if (shouldResetProgressionTargets(patch, currentProfile)) {
    const resetResult = await resetProgressionTargets(supabase as Parameters<typeof resetProgressionTargets>[0], userId);
    if (!resetResult.ok) return { ok: false, error: resetResult.error };
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);

  return error ? { ok: false, error: (error as { message: string }).message } : { ok: true };
}

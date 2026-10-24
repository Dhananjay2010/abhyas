/**
 * Core settings update logic extracted from server action
 */

import { shouldResetProgressionTargets } from "../program/reset-decision";
import { resetProgressionTargets } from "../program/progression";

interface QueryBuilder {
  eq(column: string, value: string): this;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
}

interface TableBuilder {
  select(columns: string): QueryBuilder;
  update(data: Record<string, unknown>): { eq(column: string, value: string): Promise<{ error: { message: string } | null }> };
}

interface TestableSupabaseClient {
  from(table: string): TableBuilder;
}

export async function updateProfileCore(
  deps: { supabase: TestableSupabaseClient; userId: string },
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
    const resetResult = await resetProgressionTargets(supabase as unknown as Parameters<typeof resetProgressionTargets>[0], userId);
    if (!resetResult.ok) return { ok: false, error: resetResult.error };
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);

  return error ? { ok: false, error: (error as { message: string }).message } : { ok: true };
}

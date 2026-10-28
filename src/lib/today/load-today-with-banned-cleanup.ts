/**
 * Today loader, wave 2: the week's days (exercises embedded), the member's
 * injuries and the active catalogue, then the in-memory banned-exercise
 * cleanup for knee users (no DB writes during render).
 *
 * Extracted from src/app/today/page.tsx so the cleanup call can be tested
 * against a real supabase-js client (scripts/helpers/fake-postgrest.ts)
 * without a Next.js runtime. The page calls this once and uses its result.
 *
 * W5 call-site mutant targets the applyLoaderCleanup call below.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { LoaderCleanupInput } from "@/lib/today/apply-loader-cleanup";

export type LoadTodayWithBannedCleanupInput = {
  programId: string;
  profile: LoaderCleanupInput["profile"];
  equipmentIds: string[];
  userId: string;
  applyDayCleanup: LoaderCleanupInput["applyDayCleanup"];
};

export async function loadTodayWithBannedCleanup(
  supabase: SupabaseClient<Database>,
  input: LoadTodayWithBannedCleanupInput,
) {
  // The week's days arrive with each day's exercises embedded. That is one
  // round trip instead of two, and it removes the dependency that forced the
  // exercise query to wait for the day query to name today's row.
  const [daysRes, injuriesRes, catalogueRes] = await Promise.all([
    supabase
      .from("program_days")
      // One string literal: Supabase infers the row type from it, and a
      // concatenation degrades the result to GenericStringError.
      .select("id, day_index, day_type, focus, label, program_day_exercises(id, exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises(name, cue, movement_pattern, metric))")
      .eq("status", "active")
      .eq("program_id", input.programId)
      .order("day_index")
      .order("order_index", { referencedTable: "program_day_exercises" }),
    supabase.from("user_injuries").select("body_region, severity"),
    supabase.from("exercises").select("id, slug, name, movement_pattern, mechanic, metric, primary_muscles, equipment_ids, level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds, category").eq("is_active", true),
  ]);

  let days = daysRes.data;

  // Clean banned exercises in-memory for knee users (no DB writes during render)
  const cleanupResults: { changed: boolean }[] = [];
  try {
    const { applyLoaderCleanup } = await import("@/lib/today/apply-loader-cleanup");

    days = applyLoaderCleanup(
      {
        days,
        injuries: injuriesRes.data,
        profile: input.profile,
        catalogueRows: catalogueRes.data,
        equipmentIds: input.equipmentIds,
        userId: input.userId,
        applyDayCleanup: input.applyDayCleanup,
      },
      cleanupResults
    );
  } catch {
    // Non-knee users or error: continue with original days
  }

  return { days, cleanupResults };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createBlockForUser } from "./persist";
import { CARRY_OVER_SLOTS } from "./generate";

type Client = SupabaseClient<Database>;

export type RolloverResult =
  | { status: "current"; programId: string }
  | { status: "rolled_over"; programId: string; blockNumber: number }
  | { status: "none" }
  | { status: "error"; error: string };

/**
 * Build the carry-over map for the next block.
 *
 * `SPEC.md` section 6: main compound lifts carry over between blocks, because
 * that is where progression lives — resetting them would throw away weeks of
 * accumulated working weight. Accessories are left out so they rotate.
 *
 * Keyed `${day_index}:${movement_pattern}`. Day index rather than label,
 * because a 4-day split repeats "Upper" and "Lower" — keying on the label
 * would let only the first of each carry its main lift. Only the first
 * `CARRY_OVER_SLOTS` exercises of each day count as "main".
 */
export async function extractCarryOver(
  supabase: Client,
  programId: string,
): Promise<Record<string, string>> {
  // Scoped with a plain column filter on ids we fetched ourselves, rather than
  // a filter on an embedded resource: PostgREST accepts the embedded form with
  // or without !inner and the two behave differently, so this avoids depending
  // on semantics that are easy to get subtly wrong.
  const { data: days } = await supabase
    .from("program_days")
    .select("id, day_index")
    .eq("program_id", programId);

  if (!days || days.length === 0) return {};
  const dayIndexById = new Map(days.map((d) => [d.id, d.day_index]));

  const { data } = await supabase
    .from("program_day_exercises")
    .select("program_day_id, order_index, exercise_id, exercises(movement_pattern, mechanic)")
    .in("program_day_id", [...dayIndexById.keys()])
    .lt("order_index", CARRY_OVER_SLOTS)
    .order("order_index");

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const dayIndex = dayIndexById.get(row.program_day_id);
    const ex = row.exercises as unknown as {
      movement_pattern: string;
      mechanic: string | null;
    } | null;
    if (dayIndex === undefined || !ex?.movement_pattern) continue;
    // Only compounds are "main lifts"; an isolation exercise that happened to
    // land in slot 0 is not worth preserving across a block.
    if (ex.mechanic !== "compound") continue;

    const key = `${dayIndex}:${ex.movement_pattern}`;
    if (!(key in map)) map[key] = row.exercise_id;
  }
  return map;
}

/**
 * Make sure the user's active block covers today, rolling to the next block
 * when the current one has run its four weeks.
 *
 * Safe to call on every page load: it is a no-op while the block is current.
 * Returns "none" when the user has no block at all — Today offers to build one
 * rather than creating it behind their back.
 */
export async function ensureCurrentBlock(
  supabase: Client,
  userId: string,
  today: string,
): Promise<RolloverResult> {
  const { data: active } = await supabase
    .from("programs")
    .select("id, block_number, ends_on")
    .eq("status", "active")
    .maybeSingle();

  if (!active) return { status: "none" };
  if (active.ends_on >= today) return { status: "current", programId: active.id };

  const carryOver = await extractCarryOver(supabase, active.id);
  const built = await createBlockForUser(supabase, userId, { carryOver });

  if (!built.ok) {
    // A concurrent request may have rolled over first; the partial unique index
    // on one active program per user is what makes that safe. Re-read rather
    // than surfacing a spurious error.
    const { data: retry } = await supabase
      .from("programs")
      .select("id, ends_on")
      .eq("status", "active")
      .maybeSingle();
    if (retry && retry.ends_on >= today) {
      return { status: "current", programId: retry.id };
    }
    return { status: "error", error: built.error };
  }

  return {
    status: "rolled_over",
    programId: built.programId,
    blockNumber: built.blockNumber,
  };
}

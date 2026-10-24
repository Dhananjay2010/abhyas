import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ageOn } from "@/lib/onboarding/options";
import { addDays, localDateString } from "@/lib/dates";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "./generate";
import { resolveTimezoneWithProfile } from "@/lib/timezone";

type Client = SupabaseClient<Database>;

const CATALOGUE_COLUMNS =
  "id, slug, name, movement_pattern, mechanic, metric, primary_muscles, equipment_ids, " +
  "level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds";

export type BuildResult =
  | {
      ok: true;
      programId: string;
      blockNumber: number;
      trainingDays: number;
      totalExercises: number;
    }
  | { ok: false; error: string };

/**
 * Generate and persist a 4-week block for the user.
 *
 * Any existing active program is marked completed first, so the partial unique
 * index (one active program per user) always holds.
 *
 * `mode` is the difference between the two reasons to run this, and SPEC
 * section 6 spells it out:
 *
 * - `"new"` — the four weeks ran out, or this is the user's first block. The
 *   block number increments and the start date is today.
 * - `"rebuild"` — an answer the plan depends on changed, so the block the user
 *   is IN is re-planned. Its number and start date are kept, which leaves the
 *   deload week where it was going to land and the week-in-block arithmetic
 *   intact. Without this, three settings changes took a new account to
 *   "Block 3" and one real account was displaying "Block 23 · Week 1 of 4",
 *   implying 92 weeks of training that had not happened; each change also
 *   reset `started_on` to today and dragged the deload week along with it.
 *
 * A rebuild is also idempotent, because the generator is seeded on the block
 * number: same answers in, same plan out.
 */
export async function createBlockForUser(
  supabase: Client,
  userId: string,
  options: { carryOver?: Record<string, string>; mode?: "new" | "rebuild" } = {},
): Promise<BuildResult> {
  const [
    profileRes,
    weightRes,
    equipmentRes,
    injuriesRes,
    catalogueRes,
    lastBlockRes,
    activeRes,
  ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase
        .from("body_metrics")
        .select("weight_kg")
        .order("recorded_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("user_equipment").select("equipment_id"),
      supabase.from("user_injuries").select("body_region, severity"),
      // Ordered, because the generator's determinism depends on it.
      //
      // `pickForSlot` draws one `rng()` per candidate in pool order, so the
      // random component attaches to whichever exercise happens to be at that
      // position. Without an ORDER BY the database is free to return rows in
      // any order — physical order, which changes as rows are updated — and
      // the same user with the same block number can then be handed a
      // different plan. It also made the committed fixture, which is exported
      // `order by slug`, disagree with production: the generator tests passed
      // locally while production picked something else for the same slot.
      supabase.from("exercises").select(CATALOGUE_COLUMNS).eq("is_active", true).order("slug"),
      supabase
        .from("programs")
        .select("block_number")
        .order("block_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // The block being replaced, whose identity a rebuild keeps.
      supabase
        .from("programs")
        .select("block_number, started_on")
        .eq("status", "active")
        .maybeSingle(),
    ]);

  // A rebuild with no active block to rebuild is a first build, so it falls
  // through to the new-block numbering below rather than failing.
  const rebuildOf = options.mode === "rebuild" ? activeRes.data : null;

  const profile = profileRes.data;
  if (!profile) return { ok: false, error: profileRes.error?.message ?? "Profile not found" };

  const missing = ["goal", "level", "primary_track", "days_per_week"].filter(
    (k) => profile[k as keyof typeof profile] === null,
  );
  if (missing.length > 0) {
    return { ok: false, error: `Cannot build a plan without: ${missing.join(", ")}.` };
  }

  const catalogue = (catalogueRes.data ?? []) as unknown as CandidateExercise[];
  if (catalogue.length === 0) {
    return { ok: false, error: "The exercise catalogue is empty." };
  }

  const weightKg = weightRes.data?.weight_kg ?? null;
  const bmi =
    weightKg && profile.height_cm
      ? Number(weightKg) / (Number(profile.height_cm) / 100) ** 2
      : null;

  const input: GeneratorInput = {
    userId,
    blockNumber: rebuildOf?.block_number ?? (lastBlockRes.data?.block_number ?? 0) + 1,
    goal: profile.goal!,
    level: profile.level!,
    primaryTrack: profile.primary_track!,
    daysPerWeek: profile.days_per_week!,
    yogaDaysPerWeek: profile.yoga_days_per_week ?? 0,
    age: profile.date_of_birth ? ageOn(profile.date_of_birth) : null,
    bmi,
    hasAllEquipment: profile.has_all_equipment ?? false,
    equipmentIds: (equipmentRes.data ?? []).map((r) => r.equipment_id),
    currentInjuryRegions: (injuriesRes.data ?? [])
      .filter((i) => i.severity === "current")
      .map((i) => i.body_region),
    preferredSessionMinutes: profile.preferred_session_minutes ?? 60,
    catalogue,
    carryOver: options.carryOver,
  };

  const plan = generateProgram(input);

  const trainingDays = plan.days.filter(
    (d) => d.dayType === "weights" || d.dayType === "bodyweight",
  );
  // [].every() is true, so without the length check this rejects every
  // yoga- or breathing-led plan, which has no strength days by design.
  if (trainingDays.length > 0 && trainingDays.every((d) => d.exercises.length === 0)) {
    return {
      ok: false,
      error:
        "No exercises match your equipment, level and injuries. Widen your equipment list in Settings.",
    };
  }

  // Retire any previous active block before inserting the new one.
  await supabase
    .from("programs")
    .update({ status: "completed" })
    .eq("user_id", userId)
    .eq("status", "active");

  // A rebuild keeps the block's start date, so the user stays in the week they
  // were in and the deload week does not move.
  const timezone = resolveTimezoneWithProfile(profile.timezone);
  const startedOn = rebuildOf?.started_on ?? localDateString(timezone);
  const endsOn = addDays(startedOn, 27); // four weeks inclusive

  const { data: program, error: programError } = await supabase
    .from("programs")
    .insert({
      user_id: userId,
      block_number: plan.blockNumber,
      split_type: plan.splitType,
      days_per_week: plan.daysPerWeek,
      primary_track: input.primaryTrack,
      goal: input.goal,
      level: input.level,
      started_on: startedOn,
      ends_on: endsOn,
      deload_week: plan.deloadWeek,
      status: "active",
    })
    .select("id")
    .single();

  if (programError || !program) {
    return { ok: false, error: programError?.message ?? "Could not create the program" };
  }

  const { data: insertedDays, error: daysError } = await supabase
    .from("program_days")
    .insert(
      plan.days.map((d) => ({
        program_id: program.id,
        user_id: userId, // overwritten by the definer trigger with the true owner
        day_index: d.dayIndex,
        day_type: d.dayType,
        focus: d.focus,
        label: d.label,
      })),
    )
    .select("id, day_index");

  if (daysError || !insertedDays) {
    return { ok: false, error: daysError?.message ?? "Could not create program days" };
  }

  const dayIdByIndex = new Map(insertedDays.map((d) => [d.day_index, d.id]));
  const exerciseRows = plan.days.flatMap((d) =>
    d.exercises.map((e) => ({
      program_day_id: dayIdByIndex.get(d.dayIndex)!,
      user_id: userId,
      exercise_id: e.exerciseId,
      order_index: e.orderIndex,
      target_sets: e.targetSets,
      target_reps_min: e.targetRepsMin,
      target_reps_max: e.targetRepsMax,
      rest_seconds: e.restSeconds,
    })),
  );

  if (exerciseRows.length > 0) {
    const { error } = await supabase.from("program_day_exercises").insert(exerciseRows);
    if (error) return { ok: false, error: error.message };
  }

  return {
    ok: true,
    programId: program.id,
    blockNumber: plan.blockNumber,
    trainingDays: trainingDays.length,
    totalExercises: exerciseRows.length,
  };
}

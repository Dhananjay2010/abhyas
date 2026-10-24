import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { generateProgram, CARRY_OVER_SLOTS, type GeneratorInput, type CandidateExercise } from "./generate";
import { ageOn } from "@/lib/onboarding/options";
import { addDays } from "@/lib/dates";

type Client = SupabaseClient<Database>;

const CATALOGUE_COLUMNS =
  "id, slug, name, movement_pattern, mechanic, metric, primary_muscles, equipment_ids, " +
  "level_min, contraindicated_regions, impact, spinal_load, tracks, default_rest_seconds";

type ProgramPayload = {
  id: string;
  block_number: number;
  split_type: string;
  days_per_week: number;
  primary_track: string;
  goal: string;
  level: string;
  ends_on: string;
  deload_week: number;
  days: Array<{
    day_index: number;
    day_type: string;
    focus: string | null;
    label: string | null;
    exercises: Array<{
      exercise_id: string;
      order_index: number;
      target_sets: number;
      target_reps_min: number;
      target_reps_max: number;
      rest_seconds: number;
    }>;
  }>;
};

/** The fields of the active block that a rollover decision actually needs. */
export type ActiveBlock = { id: string; ends_on: string };

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
 * Call rollover_block RPC to create a new block after the active one ends.
 * Returns the program ID (idempotent: may be from a concurrent call).
 */
async function callRolloverRPC(
  supabase: Client,
  userId: string,
  today: string,
  carryOver: Record<string, string>,
): Promise<{ ok: true; programId: string; blockNumber: number } | { ok: false; error: string }> {
  // Fetch profile and catalog to generate the plan
  const [profileRes, weightRes, equipmentRes, injuriesRes, catalogueRes, lastBlockRes] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase
        .from("body_metrics")
        .select("weight_kg")
        .order("recorded_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("user_equipment").select("equipment_id"),
      supabase.from("user_injuries").select("body_region, severity"),
      supabase.from("exercises").select(CATALOGUE_COLUMNS).eq("is_active", true).order("slug"),
      supabase
        .from("programs")
        .select("block_number")
        .not("status", "in", "(superseded,retired)")
        .order("block_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

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
    blockNumber: (lastBlockRes.data?.block_number ?? 0) + 1,
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
    carryOver,
  };

  const plan = generateProgram(input);

  const programId = crypto.randomUUID();
  const endsOn = addDays(today, 27); // four weeks inclusive

  const payload: ProgramPayload = {
    id: programId,
    block_number: plan.blockNumber,
    split_type: plan.splitType,
    days_per_week: plan.daysPerWeek,
    primary_track: input.primaryTrack,
    goal: input.goal,
    level: input.level,
    ends_on: endsOn,
    deload_week: plan.deloadWeek,
    days: plan.days.map((d) => ({
      day_index: d.dayIndex,
      day_type: d.dayType,
      focus: d.focus ?? null,
      label: d.label ?? null,
      exercises: d.exercises.map((e) => ({
        exercise_id: e.exerciseId,
        order_index: e.orderIndex,
        target_sets: e.targetSets,
        target_reps_min: e.targetRepsMin,
        target_reps_max: e.targetRepsMax,
        rest_seconds: e.restSeconds,
      })),
    })),
  };

  const { data, error } = await supabase.rpc("rollover_block", {
    p_today: today,
    p_payload: payload as unknown as Database["public"]["Functions"]["rollover_block"]["Args"]["p_payload"],
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, programId: data as string, blockNumber: plan.blockNumber };
}

/**
 * Make sure the user's active block covers today, rolling to the next block
 * when the current one has run its four weeks.
 *
 * Safe to call on every page load: while the block is current this makes no
 * database calls at all when the caller supplies the block it already read.
 * Returns "none" when the user has no block at all — Today offers to build one
 * rather than creating it behind their back.
 *
 * Idempotent: concurrent calls are safe due to the RPC's unique index guard.
 */
export async function ensureCurrentBlock(
  supabase: Client,
  userId: string,
  today: string,
  activeBlock?: ActiveBlock | null,
): Promise<RolloverResult> {
  // The caller almost always has the active block in hand already — Today reads
  // it to render the header. Accepting it here removes a second, identical
  // `programs` query from every load of that page. Passing nothing keeps the
  // original self-contained behaviour.
  const active =
    activeBlock !== undefined
      ? activeBlock
      : (
          await supabase
            .from("programs")
            .select("id, block_number, ends_on")
            .eq("status", "active")
            .maybeSingle()
        ).data;

  if (!active) return { status: "none" };
  if (active.ends_on >= today) return { status: "current", programId: active.id };

  const carryOver = await extractCarryOver(supabase, active.id);
  const built = await callRolloverRPC(supabase, userId, today, carryOver);

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

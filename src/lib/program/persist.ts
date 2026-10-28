import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ageOn } from "@/lib/onboarding/options";
import { addDays, localDateString } from "@/lib/dates";
import { retirePreviousBlock } from "./retire-previous-block";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "./generate";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { DEFAULT_SESSION_LENGTH } from "@/lib/onboarding/session-length";
import { buildInjuryFlags } from "./injury-regions";
import { activeDayIndices, activeDayIndicesAnchored } from "./splits";
import { carriedWeekdayLayout, loadLayoutSourceDays, type LayoutSourceDay } from "./weekday-layout";

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
 * Decide whether to anchor a new block's `started_on` to today.
 * 
 * For a brand new user's first block (block 1), anchor the training schedule
 * to their sign-up weekday by setting `started_on` to today. This ensures
 * their first workout lands on the day they join.
 * 
 * A mid-block rebuild of block 1 re-plans the block the member is IN and never
 * changes its weekdays: an anchored block 1 passes its original start as
 * `rebuildAnchor` (returned instead of today); a block 1 on the default mapping
 * (members from before #165) passes null and stays on it. Without this a rebuild
 * flipped a Wednesday sign-up's Wed/Fri/Sun week to Mon/Wed/Fri.
 * 
 * For all other cases (rollover to block 2+, or a rebuild of block 2+), return
 * undefined to let the RPC or rollover logic handle the start date.
 * 
 * @param blockNumber - The block number being created
 * @param isRebuild - Whether this is a rebuild of an existing block
 * @param today - The current date string (ISO format)
 * @param rebuildAnchor - For a rebuild of an anchored block 1, the date it originally
 *   started on; null/undefined when block 1 is on the default mapping
 * @returns today for new block 1, the anchor for a rebuilt block 1, undefined otherwise
 */
export function decideBlockStartedOn({
  blockNumber,
  isRebuild,
  today,
  rebuildAnchor,
}: {
  blockNumber: number;
  isRebuild: boolean;
  today: string;
  rebuildAnchor?: string | null;
}): string | undefined {
  if (blockNumber !== 1) return undefined;
  if (isRebuild) return rebuildAnchor ?? undefined;
  return today;
}

const RESTFUL_DAY_TYPES: ReadonlySet<string> = new Set(["rest", "active_recovery", "meditation"]);

function sameWeekdays(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Was this block 1 laid out by #165's anchoring, or on the default mapping?
 *
 * #165 stores no flag, so the layout itself is the signal: the block's active
 * (non-rest) weekdays are anchored when they equal
 * `activeDayIndicesAnchored(firstStartedOn, n)` and differ from the default
 * `activeDayIndices(n)`. When both layouts coincide (a Monday start) either
 * answer gives the same week. A layout that matches neither (an older
 * generator, a hand-edited plan) is treated as not anchored, which is the
 * pre-#165 behaviour.
 */
export function isAnchoredLayout(activeWeekdays: number[], firstStartedOn: string): boolean {
  const s = [...new Set(activeWeekdays)].sort((a, b) => a - b);
  if (s.length === 0) return false;
  return sameWeekdays(activeDayIndicesAnchored(firstStartedOn, s.length), s) && !sameWeekdays(activeDayIndices(s.length), s);
}

/**
 * The anchor a rebuild of block 1 must keep, or null when block 1 is on the
 * default mapping.
 *
 * The anchor date is the EARLIEST block-1 `started_on`. A mid-block rebuild_block
 * (migration 20261025000025) keeps started_on, so this is normally the active row's
 * own start; rows rebuilt under the earlier 20261025000023 version started on their
 * rebuild day, and their superseded predecessors still carry the sign-up day. The layout is read from the ACTIVE block-1
 * row's program_days, i.e. the week the member is following now. A failed read
 * fails the rebuild rather than guessing and silently moving training days.
 */
async function block1RebuildAnchor(
  supabase: Client,
  userId: string,
): Promise<{ ok: true; anchor: string | null } | { ok: false; error: string }> {
  const failed: { ok: false; error: string } = { ok: false, error: "We couldn't load your current plan. Please try again." };
  const { data: rows, error } = await supabase
    .from("programs")
    .select("id, started_on, status")
    .eq("user_id", userId)
    .eq("block_number", 1)
    .order("started_on", { ascending: true });
  if (error) {
    console.error("createBlockForUser: block-1 rows read failed", error);
    return failed;
  }
  const active = (rows ?? []).find((r) => r.status === "active");
  if (!rows || rows.length === 0 || !active) return { ok: true, anchor: null };
  const firstStartedOn = rows[0].started_on;

  const { data: days, error: daysError } = await supabase
    .from("program_days")
    .select("day_index, day_type")
    .eq("program_id", active.id)
    .eq("status", "active");
  if (daysError) {
    console.error("createBlockForUser: block-1 program_days read failed", daysError);
    return failed;
  }
  const weekdays = (days ?? []).filter((d) => !RESTFUL_DAY_TYPES.has(d.day_type)).map((d) => d.day_index);
  return { ok: true, anchor: isAnchoredLayout(weekdays, firstStartedOn) ? firstStartedOn : null };
}

/**
 * The program_days a block 2+ takes its weekdays from (QA2 M-1): the member's
 * latest non-superseded block. For a rebuild that is the active block being
 * re-planned (after a rebuild-after-end, the block rollover just opened with
 * the ended block's weekdays); for a new block it is the block before it.
 * No such block gives no days, and the generator keeps the default mapping.
 */
async function blockLayoutSourceDays(
  supabase: Client,
  userId: string,
): Promise<{ ok: true; days: LayoutSourceDay[] } | { ok: false; error: string }> {
  const failed: { ok: false; error: string } = { ok: false, error: "We couldn't load your current plan. Please try again." };
  const { data: source, error } = await supabase
    .from("programs")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "superseded")
    .order("block_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("createBlockForUser: weekday layout source read failed", error);
    return failed;
  }
  if (!source?.id) return { ok: true, days: [] };
  const days = await loadLayoutSourceDays(supabase, source.id);
  return days.ok ? days : failed;
}

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

/**
 * Call rebuild_block or rollover_block RPC with the generated plan.
 * Returns the program ID from the RPC (idempotent: may be from a concurrent call).
 */
async function callBlockRPC(
  supabase: Client,
  mode: "rebuild" | "rollover",
  today: string,
  plan: ReturnType<typeof generateProgram>,
  input: GeneratorInput,
): Promise<{ ok: true; programId: string } | { ok: false; error: string }> {
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

  const rpcName = mode === "rebuild" ? "rebuild_block" : "rollover_block";
  const { data, error } = await supabase.rpc(rpcName, {
    p_today: today,
    p_payload: payload as unknown as Database["public"]["Functions"][typeof rpcName]["Args"]["p_payload"],
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, programId: data as string };
}

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
  options: {
    carryOver?: Record<string, string>;
    mode?: "new" | "rebuild";
    /** Clock override for tests; production callers omit it and get the real current time. */
    now?: Date;
    /**
     * The member's local date, already resolved by the caller. The rebuild path
     * passes the same date it used for rollover_block so both RPCs agree on
     * p_today; when omitted it is derived from the profile timezone and `now`.
     */
    today?: string;
  } = {},
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

  const today = options.today ?? (() => {
    const timezone = resolveTimezoneWithProfile(profile.timezone);
    return localDateString(timezone, options.now);
  })();
  const blockNumber = rebuildOf?.block_number ?? (lastBlockRes.data?.block_number ?? 0) + 1;
  const isRebuild = !!rebuildOf;

  // A rebuild never changes the weekdays of the block in progress. For block 1
  // that means: keep #165's anchor if block 1 was laid out anchored, and keep
  // the default mapping if it was not (members from before #165).
  let rebuildAnchor: string | null = null;
  if (rebuildOf && rebuildOf.block_number === 1) {
    const anchor = await block1RebuildAnchor(supabase, userId);
    if (!anchor.ok) return { ok: false, error: anchor.error };
    rebuildAnchor = anchor.anchor;
  }

  // For a brand new user's first block, anchor the schedule to their sign-up weekday.
  // A rebuilt block 1 keeps that anchor; block 2+ (new or rebuilt) leaves startedOn
  // undefined and instead keeps the weekdays of the block before it (QA2 M-1),
  // unless days_per_week changed in Settings, which gets the default mapping.
  const startedOn = decideBlockStartedOn({ blockNumber, isRebuild, today, rebuildAnchor });
  let weekdayLayout: number[] | null = null;
  if (blockNumber > 1) {
    const source = await blockLayoutSourceDays(supabase, userId);
    if (!source.ok) return { ok: false, error: source.error };
    weekdayLayout = carriedWeekdayLayout(source.days, profile.days_per_week!, profile.yoga_days_per_week ?? 0);
  }

  const input: GeneratorInput = {
    userId,
    blockNumber,
    goal: profile.goal!,
    level: profile.level!,
    primaryTrack: profile.primary_track!,
    daysPerWeek: profile.days_per_week!,
    yogaDaysPerWeek: profile.yoga_days_per_week ?? 0,
    age: profile.date_of_birth ? ageOn(profile.date_of_birth) : null,
    bmi,
    hasAllEquipment: profile.has_all_equipment ?? false,
    equipmentIds: (equipmentRes.data ?? []).map((r) => r.equipment_id),
    ...buildInjuryFlags(injuriesRes.data ?? []),
    // M2 QA fix: Fall back to 45 when preferred_session_minutes is NULL
    // (happens for new users after migration 20261025000021, before they save the step)
    preferredSessionMinutes: profile.preferred_session_minutes ?? DEFAULT_SESSION_LENGTH,
    catalogue,
    carryOver: options.carryOver,
    startedOn,
    weekdayLayout,
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

  // For rebuild mode, use the rebuild_block RPC
  if (rebuildOf) {
    const result = await callBlockRPC(supabase, "rebuild", today, plan, input);
    if (!result.ok) return result;

    return {
      ok: true,
      programId: result.programId,
      blockNumber: plan.blockNumber,
      trainingDays: trainingDays.length,
      totalExercises: plan.days.flatMap((d) => d.exercises).length,
    };
  }

  // For first builds, use the legacy insert path
  // Retire any previous active block before inserting the new one.
  const retireResult = await retirePreviousBlock(supabase, userId, today);
  if (!retireResult.ok) {
    return { ok: false, error: retireResult.error! };
  }

  // For block 1, the generator already anchored the schedule via input.startedOn.
  // The database column started_on still uses today for all blocks, but this doesn't
  // affect schedule generation - that's driven by the generator's startedOn input.
  const endsOn = addDays(today, 27); // four weeks inclusive

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
      started_on: today,
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

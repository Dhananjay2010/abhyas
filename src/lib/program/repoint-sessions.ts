import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { prepareSessionExercises } from "@/lib/session/prepare-exercises";

type Client = SupabaseClient<Database>;
type DayType = Database["public"]["Enums"]["day_type"];

/**
 * Session rows that need re-pointing after a rebuild.
 */
type SessionRow = {
  id: string;
  local_date: string;
  actual_type: DayType | null;
  planned_type: DayType | null;
  program_day_id: string | null;
  old_day_label: string | null;
  old_day_index: number | null;
  has_sets: boolean;
};

/**
 * A day in the new program to map sessions to.
 */
type NewProgramDay = {
  id: string;
  day_index: number;
  day_type: DayType;
  label: string | null;
};

/**
 * Find the best matching day in the new program for a session from the old program.
 *
 * Matching priority (training days of the chosen type only):
 * 1. Label match (exact): "Upper A" → "Upper A" 
 * 2. Day index match (same weekday): Monday → Monday
 * 3. Day type match (fallback): weights → weights
 *
 * Returns the matching day or null if no match exists.
 */
export function matchNewDay(
  oldSession: {
    old_day_label: string | null;
    old_day_index: number | null;
    actual_type: DayType | null;
    planned_type: DayType | null;
  },
  newDays: NewProgramDay[],
): NewProgramDay | null {
  const chosenType = oldSession.actual_type ?? oldSession.planned_type;
  if (!chosenType) return null;

  // Non-training days (rest, yoga, meditation) have no program_day
  if (chosenType === "rest" || chosenType === "yoga" || chosenType === "meditation") {
    return null;
  }

  // 1. Try to match by label (exact match), but only training days of the chosen type
  if (oldSession.old_day_label) {
    const labelMatch = newDays.find(
      (d) => d.label === oldSession.old_day_label && d.day_type === chosenType
    );
    if (labelMatch) return labelMatch;
  }

  // 2. If no label match, try day_index (same weekday), but only training days of the chosen type
  if (oldSession.old_day_index !== null) {
    const indexMatch = newDays.find(
      (d) => d.day_index === oldSession.old_day_index  // MUTANT NEW2: no day_type check
    );
    if (indexMatch) return indexMatch;
  }

  // 3. If still no match, fall back to day_type (any training day of that type)
  const typeMatch = newDays.find((d) => d.day_type === chosenType);
  return typeMatch ?? null;
}

/**
 * Decide whether a session should be kept, updated, or rebuilt after a rebuild.
 *
 * Returns:
 * - "keep": session has 1+ logged sets, don't touch it (already correct)
 * - "rebuild": planned or 0-set session today or later, re-point and rebuild exercises
 * - "ignore": planned session before today, don't re-point
 */
export function decideRepointAction(
  session: { has_sets: boolean; local_date: string },
  today: string,
): "keep" | "rebuild" | "ignore" {
  if (session.has_sets) return "keep";
  if (session.local_date < today) return "ignore";
  return "rebuild";
}

/**
 * Re-point planned-but-unstarted sessions to the new program after a rebuild.
 *
 * A rebuild replaces `programs` and `program_days`, which leaves any `sessions`
 * rows pointing at the old block's days. This causes:
 * - Today showing "Rest" with no exercises
 * - Start loading the old plan's exercises (including equipment the user no
 *   longer has)
 * - Labels derived from the wrong plan
 *
 * The rule:
 * - Sessions with logged sets (`session_sets`) are kept unchanged: they record
 *   what the user actually did, and QA confirmed that works.
 * - Planned sessions (`status: planned`, no `session_sets`) for today or later
 *   are re-pointed to the new plan's matching day (same `day_type` or
 *   `actual_type`), or deleted if the new plan has no match.
 * - A "train anyway" or "what about tomorrow?" choice means `actual_type` may
 *   differ from the old schedule; match by the choice the user made (Upper,
 *   Lower, Full Body), not by the weekday.
 * - If the new plan has no matching day (e.g. 5→4 days, or bodyweight-only
 *   can't support a barbell choice), delete that planned row and let Today fall
 *   back to the new schedule.
 *
 * Pure: returns which sessions to update, which to delete. The caller writes
 * the changes.
 */
export function planRepointSessions(
  oldSessions: SessionRow[],
  newDays: NewProgramDay[],
  today: string,
): {
  toRebuild: Array<{ id: string; newProgramDayId: string }>;
  toUpdateProgramOnly: string[];
  toDelete: string[];
} {
  const toRebuild: Array<{ id: string; newProgramDayId: string }> = [];
  const toUpdateProgramOnly: string[] = [];
  const toDelete: string[] = [];

  for (const session of oldSessions) {
    const action = decideRepointAction(session, today);
    if (action === "keep" || action === "ignore") {
      continue;
    }

    // Non-training types (rest, yoga, meditation) don't have program_days,
    // but still need their program_id updated to the new block.
    const chosenType = session.actual_type ?? session.planned_type;
    if (chosenType === "rest" || chosenType === "yoga" || chosenType === "meditation") {
      toUpdateProgramOnly.push(session.id);
      continue;
    }

    const match = matchNewDay(session, newDays);
    if (match) {
      toRebuild.push({ id: session.id, newProgramDayId: match.id });
    } else {
      // No matching day in the new plan (e.g. 5→4 days, or bodyweight-only
      // can't support this choice): delete the planned row.
      toDelete.push(session.id);
    }
  }

  return { toRebuild, toUpdateProgramOnly, toDelete };
}

/**
 * Re-point planned sessions to the new program after a rebuild.
 *
 * Called by `createBlockForUser` after the new program is inserted, ONLY when
 * mode is "rebuild" (not on rollover or onboarding).
 */
export async function repointSessionsAfterRebuild(
  supabase: Client,
  userId: string,
  newProgramId: string,
  today: string,
): Promise<{ ok: boolean; error?: string }> {
  // Fetch sessions that might need re-pointing: planned or in_progress with 0 sets.
  // Select through session_exercises to get session_sets (there's no direct FK from
  // sessions to session_sets). Also fetch the old program day's label and day_index.
  const { data: sessions, error: selectError } = await supabase
    .from("sessions")
    .select(`
      id,
      local_date,
      actual_type,
      planned_type,
      program_day_id,
      status,
      program_days!sessions_program_day_id_fkey(label, day_index),
      session_exercises(session_sets(id))
    `)
    .eq("user_id", userId)
    .in("status", ["planned", "in_progress"])
    .gte("local_date", today);

  if (selectError) {
    console.error("repointSessionsAfterRebuild: failed to select sessions", selectError);
    return { ok: false, error: selectError.message };
  }

  if (!sessions || sessions.length === 0) return { ok: true };

  // Fetch the new program's days, ordered by day_index for deterministic matching.
  const { data: newDays, error: newDaysError } = await supabase
    .from("program_days")
    .select("id, day_index, day_type, label")
    .eq("program_id", newProgramId)
    .order("day_index");

  if (newDaysError) {
    console.error("repointSessionsAfterRebuild: failed to select new days", newDaysError);
    return { ok: false, error: newDaysError.message };
  }

  if (!newDays || newDays.length === 0) return { ok: true };

  // Transform to the shape the pure function expects.
  const sessionRows: SessionRow[] = sessions.map((s) => {
    const oldDay = Array.isArray(s.program_days) ? s.program_days[0] : s.program_days;
    const sessionExercises = Array.isArray(s.session_exercises) ? s.session_exercises : [];
    const hasSets = sessionExercises.some(
      (se: { session_sets?: { id: string }[] }) => {
        const sets = Array.isArray(se.session_sets) ? se.session_sets : [];
        return sets.length > 0;
      },
    );

    return {
      id: s.id,
      local_date: s.local_date,
      actual_type: s.actual_type,
      planned_type: s.planned_type,
      program_day_id: s.program_day_id,
      old_day_label: oldDay?.label ?? null,
      old_day_index: oldDay?.day_index ?? null,
      has_sets: hasSets,
    };
  });

  const { toRebuild, toUpdateProgramOnly, toDelete } = planRepointSessions(sessionRows, newDays, today);

  // For sessions that need rebuilding (0 sets), fetch their new program day exercises
  const rebuildPromises = toRebuild.map(async (r) => {
    // Fetch the new program day's exercises
    const { data: dayExercises, error: dayError } = await supabase
      .from("program_day_exercises")
      .select("exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises(metric)")
      .eq("program_day_id", r.newProgramDayId)
      .order("order_index");

    if (dayError || !dayExercises) {
      return { error: dayError };
    }

    // Find the session to get user_id and is_deload
    const session = sessions.find((s) => s.id === r.id);
    if (!session) {
      return { error: { message: `Session ${r.id} not found` } };
    }

    // Delete old session_exercises
    const { error: deleteError } = await supabase
      .from("session_exercises")
      .delete()
      .eq("session_id", r.id);

    if (deleteError) {
      return { error: deleteError };
    }

    // Prepare new session exercises (use session's is_deload from database)
    const { data: sessionData, error: sessionError } = await supabase
      .from("sessions")
      .select("user_id, is_deload")
      .eq("id", r.id)
      .single();

    if (sessionError || !sessionData) {
      return { error: sessionError };
    }

    const newExercises = prepareSessionExercises(
      r.id,
      sessionData.user_id,
      dayExercises,
      sessionData.is_deload,
    );

    // Insert new session_exercises
    const { error: insertError } = await supabase
      .from("session_exercises")
      .insert(newExercises);

    if (insertError) {
      return { error: insertError };
    }

    // Update session's program_day_id and program_id
    return supabase
      .from("sessions")
      .update({ program_day_id: r.newProgramDayId, program_id: newProgramId })
      .eq("id", r.id);
  });

  // Apply the updates in parallel, checking errors.
  const updateResults = await Promise.all([
    ...rebuildPromises,
    toUpdateProgramOnly.length > 0
      ? supabase
          .from("sessions")
          .update({ program_id: newProgramId })
          .in("id", toUpdateProgramOnly)
      : Promise.resolve({ error: null }),
    toDelete.length > 0
      ? supabase.from("sessions").delete().in("id", toDelete)
      : Promise.resolve({ error: null }),
  ]);

  const failures = updateResults.filter((r) => r.error);
  if (failures.length > 0) {
    console.error(
      "repointSessionsAfterRebuild: some updates failed",
      failures.map((f) => f.error?.message),
    );
    return { ok: false, error: `${failures.length} session updates failed` };
  }

  return { ok: true };
}

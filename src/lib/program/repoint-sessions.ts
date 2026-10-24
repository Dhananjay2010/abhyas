import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

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
 * Matching priority:
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

  // 1. Try to match by label (exact match)
  if (oldSession.old_day_label) {
    const labelMatch = newDays.find((d) => d.label === oldSession.old_day_label);
    if (labelMatch) return labelMatch;
  }

  // 2. If no label match, try day_index (same weekday)
  if (oldSession.old_day_index !== null) {
    const indexMatch = newDays.find((d) => d.day_index === oldSession.old_day_index);
    if (indexMatch) return indexMatch;
  }

  // 3. If still no match, fall back to day_type (any training day)
  const typeMatch = newDays.find((d) => d.day_type === chosenType);
  return typeMatch ?? null;
}

/**
 * Decide whether a session should be kept, updated, or deleted after a rebuild.
 *
 * Returns:
 * - "keep": session has logged sets, don't touch it
 * - "update": planned session with no sets, should be re-pointed
 * - "delete": planned session before today, don't re-point
 */
export function decideRepointAction(
  session: { has_sets: boolean; local_date: string },
  today: string,
): "keep" | "update" | "delete" {
  if (session.has_sets) return "keep";
  if (session.local_date < today) return "delete";
  return "update";
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
): { toUpdate: Array<{ id: string; newProgramDayId: string }>; toDelete: string[] } {
  const toUpdate: Array<{ id: string; newProgramDayId: string }> = [];
  const toDelete: string[] = [];

  for (const session of oldSessions) {
    const action = decideRepointAction(session, today);
    if (action === "keep" || action === "delete") {
      if (action === "delete") toDelete.push(session.id);
      continue;
    }

    const match = matchNewDay(session, newDays);
    if (match) {
      toUpdate.push({ id: session.id, newProgramDayId: match.id });
    } else {
      // No matching day in the new plan (e.g. 5→4 days, or bodyweight-only
      // can't support this choice): delete the planned row.
      toDelete.push(session.id);
    }
  }

  return { toUpdate, toDelete };
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
  // Fetch planned sessions that might need re-pointing. Select through
  // session_exercises to get session_sets (there's no direct FK from sessions
  // to session_sets). Also fetch the old program day's label and day_index for
  // matching.
  const { data: sessions, error: selectError } = await supabase
    .from("sessions")
    .select(`
      id,
      local_date,
      actual_type,
      planned_type,
      program_day_id,
      program_days!sessions_program_day_id_fkey(label, day_index),
      session_exercises(session_sets(id))
    `)
    .eq("user_id", userId)
    .eq("status", "planned")
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

  const { toUpdate, toDelete } = planRepointSessions(sessionRows, newDays, today);

  // Apply the updates in parallel, checking errors.
  const updateResults = await Promise.all([
    ...toUpdate.map((u) =>
      supabase
        .from("sessions")
        .update({ program_day_id: u.newProgramDayId, program_id: newProgramId })
        .eq("id", u.id),
    ),
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

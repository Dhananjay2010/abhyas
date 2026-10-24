import { buildSessionExerciseRows } from "@/lib/session/build-session-exercises";
import { ensureCurrentBlock } from "@/lib/program/rollover";
import { cycleWeekFor } from "@/lib/program/block-range";
import { isoWeekday, localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { pickReusableSession } from "@/lib/session/reusable-session";

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

// Minimal Supabase client interface
export interface SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

/**
 * Core session start/resume logic with validation.
 *
 * Extracted from the server action for testability. Validates exercise targets
 * BEFORE creating the session, ensuring invalid data (NaN, negative sets, etc.)
 * never results in a session row.
 */
export async function startSessionCore(
  supabase: SupabaseClient,
  userId: string,
  deps: {
    ensureSessionExercises: (
      supabase: SupabaseClient,
      userId: string,
      sessionId: string,
    ) => Promise<void>;
  },
): Promise<Result<{ sessionId: string }>> {
  const [profileRes, openRes, settingsRes] = await Promise.all([
    supabase.from("profiles").select("timezone, primary_track").eq("id", userId).single(),
    supabase
      .from("sessions")
      .select("id, status, local_date, actual_type, started_at")
      .in("status", ["planned", "in_progress", "skipped"])
      .order("local_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("user_settings").select("resume_session").eq("user_id", userId).maybeSingle(),
  ]);

  const timezone = resolveTimezoneWithProfile(profileRes.data?.timezone);
  const today = localDateString(timezone);
  const resumeEnabled = settingsRes.data?.resume_session ?? true;

  const todayRows = (openRes.data ?? []).filter((s: { local_date: string }) => s.local_date === today);
  const existing = pickReusableSession(todayRows, resumeEnabled);

  if (existing) {
    await Promise.all([
      supabase
        .from("sessions")
        .update({
          status: "in_progress",
          ...(existing.started_at === null || existing.status === "skipped"
            ? { started_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", existing.id),
      deps.ensureSessionExercises(supabase, userId, existing.id),
    ]);
    return { ok: true, data: { sessionId: existing.id } };
  }

  const rolloverResult = await ensureCurrentBlock(supabase, userId, today);
  if (rolloverResult.status === "none") {
    return { ok: false, error: "You have no active training block." };
  }
  if (rolloverResult.status === "error") {
    return { ok: false, error: rolloverResult.error };
  }

  const program = (
    await supabase
      .from("programs")
      .select("id, started_on, deload_week, week_offset, program_days(id, day_index, day_type, focus, label)")
      .eq("id", rolloverResult.programId)
      .maybeSingle()
  ).data;

  if (!program) return { ok: false, error: "Could not load the training block." };

  const dayIndex = isoWeekday(today);
  const day = (program.program_days ?? []).find((d: { day_index: number }) => d.day_index === dayIndex);
  if (!day) return { ok: false, error: "No plan for today." };

  const week = cycleWeekFor({ started_on: program.started_on, week_offset: program.week_offset }, today);
  const isDeloadWeek = week === program.deload_week;

  const { data: planned } = await supabase
    .from("program_day_exercises")
    .select("exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises!program_day_exercises_exercise_id_fkey(metric, equipment_ids)")
    .eq("program_day_id", day.id)
    .order("order_index");

  // Validate exercise targets before creating the session.
  // buildSessionExerciseRows may throw RangeError for invalid inputs (NaN, negative, etc).
  let validatedRows;
  try {
    if (planned && planned.length > 0) {
      validatedRows = buildSessionExerciseRows(planned, { isDeload: isDeloadWeek });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Invalid exercise targets: ${msg}` };
  }

  // Only create the session after validation succeeds
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      program_id: program.id,
      program_day_id: day.id,
      local_date: today,
      week_in_block: week,
      is_deload: isDeloadWeek,
      planned_type: day.day_type,
      actual_type: day.day_type,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return { ok: false, error: sessionError?.message ?? "Could not start the session" };
  }

  if (validatedRows && validatedRows.length > 0) {
    const { error } = await supabase.from("session_exercises").insert(
      validatedRows.map((r: unknown) => ({
        session_id: session.id,
        user_id: userId,
        ...r,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, data: { sessionId: session.id } };
}

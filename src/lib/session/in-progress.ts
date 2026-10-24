import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { localDateString } from "@/lib/dates";

type DbClient = SupabaseClient<Database>;

export type InProgressSession = {
  id: string;
  title: string;
  workingSetsLogged: number;
  startedAt: string;
};

/**
 * Get the user's in-progress session for today, if one exists.
 * 
 * Returns the session's id, title (exercise label), count of working sets
 * logged (warm-ups are excluded), and when it was started (ISO timestamp).
 * 
 * Returns null if the user has no in-progress session today.
 * 
 * M2: Only today's in-progress session is returned. Past-day in-progress
 * sessions are not resumable and are displayed in History with a "Close out"
 * action.
 * 
 * Read-only: this query does not modify any data.
 */
export async function getInProgressSession(
  supabase: DbClient,
  userId: string,
  timezone: string
): Promise<InProgressSession | null> {
  // M2: Fetch profile to get saved timezone, resolve it, then compute today
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .single();

  const tz = resolveTimezoneWithProfile(profile?.timezone);
  const today = localDateString(tz);

  // Find the user's in_progress session for today
  const { data: sessions, error: sessionError } = await supabase
    .from("sessions")
    .select("id, started_at, local_date, program_days(label)")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .eq("local_date", today)
    .order("started_at", { ascending: false })
    .limit(1);

  if (sessionError || !sessions || sessions.length === 0) {
    return null;
  }

  const session = sessions[0];

  // Get the session's exercise IDs first
  const { data: exercises, error: exercisesError } = await supabase
    .from("session_exercises")
    .select("id")
    .eq("session_id", session.id);

  if (exercisesError || !exercises || exercises.length === 0) {
    // Session exists but has no exercises yet
    const programDay = session.program_days as unknown as { label: string } | null;
    return {
      id: session.id,
      title: programDay?.label ?? "Workout",
      workingSetsLogged: 0,
      startedAt: session.started_at ?? new Date().toISOString(),
    };
  }

  const exerciseIds = exercises.map((e) => e.id);

  // Count working sets (is_warmup_set = false)
  const { data: sets, error: setsError } = await supabase
    .from("session_sets")
    .select("id")
    .eq("user_id", userId)
    .eq("is_warmup_set", false)
    .in("session_exercise_id", exerciseIds);

  if (setsError) {
    return null;
  }

  const programDay = session.program_days as unknown as { label: string } | null;
  const title = programDay?.label ?? "Workout";
  const workingSetsLogged = sets?.length ?? 0;

  return {
    id: session.id,
    title,
    workingSetsLogged,
    startedAt: session.started_at ?? new Date().toISOString(),
  };
}

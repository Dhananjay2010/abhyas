import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import type { WarmupRow } from "@/lib/program/warmup";
import { nextDayPlan } from "@/lib/program/day-plan";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { SessionRunner } from "./session-runner";
import { isUuid } from "@/lib/ids";
import { buildExerciseProgressQuery } from "@/lib/session/progress-query";
import { shouldRedirectSession } from "@/lib/today/session-detection";
import { loadSessionPageData } from "@/lib/session/load-session-page-data";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  if (!isUuid(id)) notFound();
  
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  // ---- one wave -----------------------------------------------------------
  // This screen is opened mid-workout, so its latency is felt more than any
  // other. It used to run six waves of queries one after another: the session,
  // then a batch of six, then the user's progress on each lift (which needed
  // the exercise ids from the batch), then the sets already logged (which
  // needed the session-exercise ids).
  //
  // Both of those dependencies are removed rather than merely parallelised.
  // The sets come back embedded in the session row, so nothing has to learn an
  // id first; and `exercise_progress` is read whole — row-level security scopes
  // it to this user and it holds one small row per lift they have ever trained,
  // so filtering it by the ids in this session bought nothing but a round trip.
  const [sessionRes, settingsRes, profileRes, injuriesRes, warmupsRes, equipmentRes, progressRes] =
    await Promise.all([
      supabase
        .from("sessions")
        // Must be one string literal: Supabase infers row types from it, and a
        // concatenation degrades the result to GenericStringError.
        //
        // `exercises` is disambiguated by constraint name because
        // session_exercises points at it twice — once for the exercise itself
        // and once for what it was swapped from. Without the hint PostgREST
        // answers PGRST201 rather than guessing.
        .select("id, status, local_date, is_deload, week_in_block, warmup_completed, started_at, session_exercises(id, order_index, planned_sets, planned_reps_min, planned_reps_max, rest_seconds, status, feel, metric, exercises!session_exercises_exercise_id_fkey(id, name, cue, movement_pattern, primary_muscles, equipment_ids), session_sets(set_number, reps, weight_kg, duration_seconds, is_warmup_set, completed_at))")
        .eq("id", id)
        .order("order_index", { referencedTable: "session_exercises" })
        .maybeSingle(),
      supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
      supabase
        .from("profiles")
        .select("primary_track, has_all_equipment, timezone, units")
        .eq("id", user.id)
        .single(),
      supabase.from("user_injuries").select("body_region, severity"),
      supabase.from("warmup_exercises").select("*").eq("is_active", true),
      supabase.from("user_equipment").select("equipment_id"),
      buildExerciseProgressQuery(supabase, user.id),
    ]);

  // A failed query used to fall through to "this session has no exercises",
  // which is indistinguishable from a genuinely empty session. It hid a
  // PGRST201 ambiguous-embed error for the entire life of this page, so a real
  // failure is raised rather than swallowed.
  //
  // The one exception is a route parameter that is not a UUID at all: Postgres
  // rejects it as invalid input (22P02), and the honest answer to "/session/
  // nonsense" is 404, not a server error.
  if (sessionRes.error) {
    if (sessionRes.error.code === "22P02") notFound();
    throw new Error(`Could not load this session: ${sessionRes.error.message}`);
  }
  
  // Log progress query error but don't throw (LOW requirement)
  if (progressRes.error) {
    console.error("Failed to load exercise progress:", progressRes.error.message);
  }

  const session = sessionRes.data;
  if (!session) notFound();
  
  // Only redirect completed sessions. An in_progress session stays accessible
  // regardless of timezone changes: a user who switches to a zone where it's
  // the next day can still resume their active session.
  if (shouldRedirectSession(session.status)) redirect("/today");

  const rows = session.session_exercises ?? [];
  const progressByExercise = new Map(
    (progressRes.data ?? []).map((p) => [p.exercise_id, p]),
  );

  /*
    Daily menu means no working-weight memory.

    SPEC section 6 says so, and Settings says it to the user's face -- "A
    sensible session each day, with no weight memory" -- but the only thing the
    mode actually did was stop `applyProgression` running. The weights it had
    already remembered were still read here, still printed as "Working weight
    60 kg" above the exercise, and still prefilled into the box. The mode kept
    the memory it promises not to.

    History is untouched, which is the other half of the promise: switching back
    to progression resumes from the last known weights, because they were never
    deleted -- only ignored while the user asked for them to be.
  */
  const remembersWeights = settingsRes.data?.planning_mode !== "daily_menu";

  // "What about tomorrow?" needs the block's own days to offer as alternatives,
  // and what tomorrow already is. MED-1 fix: precompute targetLocalDate as
  // session.local_date + 1 (matches PR #166). This ensures a session finishing
  // after midnight still plans the correct next day, and the swap check uses
  // the session's date. Pass session.id to query the specific session.
  const timezone = resolveTimezoneWithProfile(profileRes.data?.timezone);
  const { addDays } = await import("@/lib/dates");
  const targetLocalDate = session.local_date ? addDays(session.local_date, 1) : undefined;

  // Load all session page data (exercises, warmup, cooldown, settings, tomorrow, isStale, runnerProps)
  const pageData = await loadSessionPageData({
    client: supabase,
    session,
    user,
    rows,
    progressByExercise,
    remembersWeights,
    warmupsRes,
    injuriesRes,
    settingsRes,
    profileRes,
    equipmentRes,
    timezone,
    targetLocalDate,
    nextDayPlan,
  });

  return <SessionRunner {...pageData} />;
}

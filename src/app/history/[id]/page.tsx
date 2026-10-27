import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sessionLabel } from "@/components/session-row";
import { getAuthedClient } from "@/lib/supabase/auth";
import { BreathingDetail, type BreathingLog } from "./breathing-detail";
import { Stat } from "./stat";
import { isUuid } from "@/lib/ids";
import { EditSession } from "./edit-session";
import { EditSets } from "./edit-sets";
import { SessionActions } from "./session-actions";
import { exerciseCompletion } from "@/lib/session/completion";
import { countWorkingSets } from "@/lib/session/count-sets";
import { formatVolume, formatWeight, getUnitsPreference } from "@/lib/units";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { formatSessionDateTime } from "@/lib/history/format-session-datetime";
import { formatDurationMinutes } from "@/lib/history/compute-duration";
import { computeDetailPageDuration } from "@/lib/history/compute-detail-page-duration";

export const dynamic = "force-dynamic";

const FEEL_LABEL: Record<string, string> = {
  easy: "felt easy",
  right: "felt about right",
  hard: "felt hard",
};

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  if (!isUuid(id)) notFound();
  
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  // Fetch profile for units and timezone
  const { data: profile } = await supabase
    .from("profiles")
    .select("units, timezone, created_at")
    .eq("id", user.id)
    .single();
  
  // Get auth user created_at as fallback
  const { data: authUser } = await supabase.auth.getUser();
  const signupDate = profile?.created_at || authUser?.user?.created_at || new Date().toISOString();
  
  const units = getUnitsPreference(profile?.units);

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    // The pattern is named through its foreign key, so a second link between
    // the two tables (breathing_logs is one) can never make it ambiguous.
    .select("id, local_date, status, actual_type, duration_seconds, is_deload, week_in_block, notes, started_at, completed_at, program_days(label), breathing_patterns!sessions_breathing_pattern_id_fkey(name, slug), breathing_logs(pattern_name, cycles_completed, planned_cycles, breaths, seconds, ended_early, mood_before, mood_after, guidance, routine_name, routine_step)")
    .eq("id", id)
    .maybeSingle();
  
  if (sessionError) {
    throw new Error(`Could not load this session: ${sessionError.message}`);
  }
  if (!session) notFound();

  if (session.actual_type === "meditation") {
    const pattern = session.breathing_patterns as unknown as { name: string; slug: string } | null;
    // A routine has one log per step, in step order. A single practice has one.
    const logs = ((session.breathing_logs ?? []) as unknown as BreathingLog[])
      .slice()
      .sort((a, b) => (a.routine_step ?? 1) - (b.routine_step ?? 1));
    const first = logs[0] ?? null;
    const routineName = first?.routine_name ?? null;
    const timezone = resolveTimezoneWithProfile(profile?.timezone);
    return (
      <BreathingDetail
        name={routineName ?? pattern?.name ?? first?.pattern_name ?? "Breathing"}
        // A routine repeats as a routine; there is no single practice to send
        // you back to. Its own slug is not on the log, so the button is left
        // off rather than pointing somewhere wrong.
        slug={routineName ? null : (pattern?.slug ?? null)}
        isRoutine={routineName !== null}
        localDate={session.local_date}
        startedAt={session.started_at}
        timezone={timezone}
        seconds={
          logs.length > 0 ? logs.reduce((n, l) => n + l.seconds, 0) : session.duration_seconds
        }
        logs={logs}
      />
    );
  }

  const { data: exercises, error: exercisesError } = await supabase
    .from("session_exercises")
    .select("id, order_index, status, feel, planned_sets, planned_reps_min, planned_reps_max, metric, exercises!session_exercises_exercise_id_fkey(name), swapped_from_exercise_id")
    .eq("session_id", id)
    .order("order_index");

  const ids = (exercises ?? []).map((e) => e.id);
  const { data: sets } = await supabase
    .from("session_sets")
    .select("session_exercise_id, set_number, reps, weight_kg, duration_seconds, is_warmup_set, completed_at")
    .in("session_exercise_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .order("set_number");

  if (exercisesError) {
    throw new Error(`Could not load this session: ${exercisesError.message}`);
  }

  const label = sessionLabel(
    (session.program_days as unknown as { label: string } | null)?.label ?? null,
    session.actual_type,
  );
  
  // Item 9: Duration - use stored duration_seconds, or compute from sets if NULL
  // L-4: Use chronologically latest set, not highest set_number
  // QA LOW A & B: Filter to working sets before computing duration (drop warm-ups)
  const durationSeconds = computeDetailPageDuration(
    { duration_seconds: session.duration_seconds, started_at: session.started_at },
    sets ?? []
  );
  const minutes = durationSeconds !== null ? Math.round(durationSeconds / 60) : null;
  
  const volume = (sets ?? []).reduce(
    (n, s) => n + (s.reps ?? 0) * Number(s.weight_kg ?? 0),
    0,
  );

  // TZ-2: Format date and time consistently (item 9: always from started_at)
  const timezone = resolveTimezoneWithProfile(profile?.timezone);
  const dateTimeLabel = formatSessionDateTime(session.started_at, session.local_date, timezone);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-16">
      <Link href="/history" className="text-sm text-muted underline underline-offset-2">
        ← History
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">{label}</h1>
      <p className="mt-1 text-sm text-muted">
        {dateTimeLabel}
        {session.week_in_block && ` · week ${session.week_in_block}`}
        {session.is_deload && " · deload"}
      </p>

      <EditSession
        sessionId={session.id}
        localDate={session.local_date}
        startedAt={session.started_at}
        completedAt={session.completed_at}
        timezone={resolveTimezoneWithProfile(profile?.timezone)}
        signupDate={signupDate}
      />

      <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
        <Stat label="Time" value={minutes !== null ? `${minutes}m` : "—"} />
        <Stat label="Sets" value={`${countWorkingSets(sets ?? [])}`} />
        <Stat label="Volume" value={volume > 0 ? formatVolume(volume, units) : "—"} />
      </dl>

      <ol className="mt-8 space-y-3">
        {(exercises ?? []).map((e) => {
          const ex = e.exercises as unknown as { name: string } | null;
          const name = ex?.name ?? "Exercise";
          /*
            The unit this session was run in, recorded on the session row.
            Reading `exercises.metric` here re-interpreted history: a plank
            logged in reps before the metric existed came back as a hold, and
            re-tagging any exercise would do the same to every past session of
            it. The sets-based fallback below stays as a belt-and-braces for a
            row whose stamp and contents somehow disagree.
          */
          const isTimed = e.metric === "seconds";
          const mine = (sets ?? []).filter((s) => s.session_exercise_id === e.id && !s.is_warmup_set);
          const completion = exerciseCompletion(mine.length, e.planned_sets ?? 0);
          return (
            <li key={e.id} className="rounded-xl border border-border bg-surface px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{name}</span>
                {completion === "skipped" && (
                  <span className="shrink-0 text-xs text-muted">skipped</span>
                )}
                {completion === "partial" && (
                  <span className="shrink-0 text-xs text-muted">
                    {mine.length} of {e.planned_sets} {e.planned_sets === 1 ? "set" : "sets"}
                  </span>
                )}
              </div>
              {e.swapped_from_exercise_id && (
                <p className="mt-0.5 text-xs text-muted">swapped in</p>
              )}
              {mine.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {mine.map((s) => (
                    <li
                      key={s.set_number}
                      className="flex justify-between gap-3 text-sm tabular-nums"
                    >
                      <span className="text-muted">Set {s.set_number}</span>
                      <span>
                        {/*
                          Fall back to whatever the row actually holds: showing
                          "—s" for a set logged in reps hid work that was
                          genuinely recorded.
                        */}
                        {isTimed && s.duration_seconds !== null
                          ? `${s.duration_seconds}s`
                          : s.reps !== null
                            ? `${s.reps} ${s.reps === 1 ? "rep" : "reps"}`
                            : isTimed
                              ? "—s"
                              : "— reps"}
                        {s.weight_kg ? ` · ${formatWeight(Number(s.weight_kg), units)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted">No sets recorded.</p>
              )}
              {e.feel && (
                <p className="mt-2 text-xs text-muted">{FEEL_LABEL[e.feel] ?? e.feel}</p>
              )}
            </li>
          );
        })}
      </ol>

      <EditSets
        units={units}
        exercises={(exercises ?? []).map((e) => ({
          id: e.id,
          name: (e.exercises as unknown as { name: string } | null)?.name ?? "Exercise",
          metric: e.metric || "reps",
          sets: (sets ?? []).filter((s) => s.session_exercise_id === e.id).map((s) => ({
            session_exercise_id: s.session_exercise_id,
            set_number: s.set_number,
            reps: s.reps,
            weight_kg: s.weight_kg,
            duration_seconds: s.duration_seconds,
            is_warmup_set: s.is_warmup_set,
          })),
        }))}
      />

      <SessionActions sessionId={session.id} />
    </main>
  );
}

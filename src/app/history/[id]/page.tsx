import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sessionLabel } from "@/components/session-row";
import { getAuthedClient } from "@/lib/supabase/auth";
import { BreathingDetail, type BreathingLog } from "./breathing-detail";
import { Stat } from "./stat";

export const dynamic = "force-dynamic";

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

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
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const { data: session } = await supabase
    .from("sessions")
    // The pattern is named through its foreign key, so a second link between
    // the two tables (breathing_logs is one) can never make it ambiguous.
    .select("id, local_date, status, actual_type, duration_seconds, is_deload, week_in_block, notes, program_days(label), breathing_patterns!sessions_breathing_pattern_id_fkey(name, slug), breathing_logs(pattern_name, cycles_completed, planned_cycles, breaths, seconds, ended_early, mood_before, mood_after, guidance)")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();

  if (session.actual_type === "meditation") {
    const pattern = session.breathing_patterns as unknown as { name: string; slug: string } | null;
    const log = ((session.breathing_logs ?? []) as unknown as BreathingLog[])[0] ?? null;
    return (
      <BreathingDetail
        name={pattern?.name ?? log?.pattern_name ?? "Breathing"}
        slug={pattern?.slug ?? null}
        localDate={session.local_date}
        seconds={log?.seconds ?? session.duration_seconds}
        log={log}
      />
    );
  }

  const { data: exercises, error: exercisesError } = await supabase
    .from("session_exercises")
    .select("id, order_index, status, feel, planned_sets, planned_reps_min, planned_reps_max, exercises!session_exercises_exercise_id_fkey(name), swapped_from_exercise_id")
    .eq("session_id", id)
    .order("order_index");

  const ids = (exercises ?? []).map((e) => e.id);
  const { data: sets } = await supabase
    .from("session_sets")
    .select("session_exercise_id, set_number, reps, weight_kg")
    .in("session_exercise_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .eq("is_warmup_set", false)
    .order("set_number");

  if (exercisesError) {
    throw new Error(`Could not load this session: ${exercisesError.message}`);
  }

  const label = sessionLabel(
    (session.program_days as unknown as { label: string } | null)?.label ?? null,
    session.actual_type,
  );
  const minutes = session.duration_seconds ? Math.round(session.duration_seconds / 60) : null;
  const volume = (sets ?? []).reduce(
    (n, s) => n + (s.reps ?? 0) * Number(s.weight_kg ?? 0),
    0,
  );

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-16">
      <Link href="/history" className="text-sm text-muted underline underline-offset-2">
        ← History
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">{label}</h1>
      <p className="mt-1 text-sm text-muted">
        {longDate(session.local_date)}
        {session.week_in_block && ` · week ${session.week_in_block}`}
        {session.is_deload && " · deload"}
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
        <Stat label="Time" value={minutes !== null ? `${minutes}m` : "—"} />
        <Stat label="Sets" value={`${(sets ?? []).length}`} />
        <Stat label="Volume" value={volume > 0 ? `${Math.round(volume)}kg` : "—"} />
      </dl>

      <ol className="mt-8 space-y-3">
        {(exercises ?? []).map((e) => {
          const name = (e.exercises as unknown as { name: string } | null)?.name ?? "Exercise";
          const mine = (sets ?? []).filter((s) => s.session_exercise_id === e.id);
          return (
            <li key={e.id} className="rounded-xl border border-border bg-surface px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{name}</span>
                {e.status === "skipped" && (
                  <span className="shrink-0 text-xs text-muted">skipped</span>
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
                        {s.reps ?? "—"} reps
                        {s.weight_kg ? ` · ${Number(s.weight_kg)} kg` : ""}
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
    </main>
  );
}

import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { localDateString } from "@/lib/dates";
import { SessionRow, sessionLabel, type SessionSummary } from "@/components/session-row";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  // The profile is only needed for the timezone, and nothing else here waits
  // on it, so it goes out with the rest rather than ahead of them.
  const [profileRes, sessionsRes, volumeRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("timezone, onboarding_completed_at")
      .eq("id", user.id)
      .single(),
    supabase
      .from("sessions")
      // The pattern is named through its foreign key. A bare embed resolves
      // today (checked against the live API), but breathing_logs also links
      // these two tables, and if it ever became a many-to-many join a bare
      // embed would turn ambiguous and fail -- the breakage context/07 records.
      .select("id, local_date, status, actual_type, duration_seconds, is_deload, week_in_block, program_days(label), breathing_patterns!sessions_breathing_pattern_id_fkey(name, phases), breathing_logs(breaths, routine_name)")
      .order("local_date", { ascending: false })
      .limit(60),
    // Bounded to comfortably cover the 60 sessions rendered above. This used to
    // select the whole view: every completed session the user has ever done,
    // aggregated, to annotate at most sixty rows.
    supabase
      .from("session_volume")
      .select("session_id, volume_kg, set_count")
      .order("local_date", { ascending: false })
      .limit(120),
  ]);

  const profile = profileRes.data;
  if (!profile) redirect("/");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  if (sessionsRes.error) {
    throw new Error(`Could not load your history: ${sessionsRes.error.message}`);
  }

  const today = localDateString(profile.timezone || "Asia/Kolkata");
  /*
    Nothing in the future. A "what about tomorrow?" choice is a `sessions` row
    dated tomorrow, so History -- which has no date filter, because the user's
    timezone arrives with the profile in the same wave as the query -- listed
    "Rest · Mon 14 Sept · Not started" at the top of a list of things that had
    already happened. Filtered here rather than in SQL so the profile and the
    sessions still go out together; at most a handful of rows are dropped.
  */
  const sessions = (sessionsRes.data ?? []).filter((s) => s.local_date <= today);
  const volumeById = new Map(
    (volumeRes.data ?? []).map((v) => [v.session_id, v]),
  );

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">History</h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        {sessions.length === 0
          ? "Nothing here yet."
          : sessions.length === 1
            ? "Your most recent session."
            : `Your last ${sessions.length} sessions.`}
      </p>

      {sessions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted">
          Finish a session and it will appear here, with every set you logged.
        </p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => {
            const vol = volumeById.get(s.id);
            const isBreathing = s.actual_type === "meditation";
            const logs = (s.breathing_logs ?? []) as Array<{
              breaths: number;
              routine_name: string | null;
            }>;
            // A routine is named for itself. The session's own pattern link
            // points at its first step, which would name a "Downshift" after
            // the sigh it happens to start with.
            const routineName = logs.find((l) => l.routine_name)?.routine_name ?? null;
            const pattern = s.breathing_patterns as unknown as
              | { name: string; phases: unknown }
              | null;
            // Kapalabhati counts pumps, not breaths. A routine never can: it
            // cannot contain a gated practice, and its pattern link points at
            // its first step, so the row would take the wrong word from it.
            const pumps =
              routineName === null &&
              Array.isArray(pattern?.phases) &&
              pattern.phases.some(
                (p) => typeof p === "object" && p !== null && (p as { kind?: string }).kind === "pump",
              );
            const summary: SessionSummary = {
              id: s.id,
              localDate: s.local_date,
              label: sessionLabel(
                (s.program_days as unknown as { label: string } | null)?.label ?? null,
                s.actual_type,
                routineName ??
                  (s.breathing_patterns as unknown as { name: string } | null)?.name ??
                  null,
              ),
              status: s.status,
              isDeload: s.is_deload,
              durationSeconds: s.duration_seconds,
              setCount: vol?.set_count ?? 0,
              volumeKg: Number(vol?.volume_kg ?? 0),
              breathing: isBreathing
                ? { breaths: logs.length ? logs.reduce((n, l) => n + l.breaths, 0) : null, pumps }
                : null,
            };
            return (
              <li key={s.id}>
                <SessionRow s={summary} today={today} />
              </li>
            );
          })}
        </ul>
      )}

    </main>
  );
}

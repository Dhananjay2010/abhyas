import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BarChart, LineChart, StatTile, type Point } from "@/components/charts";
import { BottomNav } from "@/components/bottom-nav";
import { computeStreaks, type DayRecord } from "@/lib/progress/streaks";
import { dateRange, isoWeekday, localDateString } from "@/lib/dates";
import { LogWeight } from "./log-weight";

export const dynamic = "force-dynamic";

/** "8 Sep" — short enough for an axis on a 390px screen. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const timezone = profile.timezone || "Asia/Kolkata";
  const today = localDateString(timezone);

  const [weightsRes, volumeRes, strengthRes, programRes, sessionsRes] = await Promise.all([
    supabase
      .from("body_metrics")
      .select("recorded_on, weight_kg")
      .order("recorded_on")
      .limit(120),
    supabase
      .from("session_volume")
      .select("local_date, volume_kg, set_count, duration_seconds")
      .order("local_date")
      .limit(60),
    supabase
      .from("exercise_strength_history")
      .select("exercise_id, exercise_name, local_date, best_e1rm, top_weight_kg")
      .order("local_date")
      .limit(400),
    supabase
      .from("programs")
      .select("id, started_on")
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("sessions")
      .select("local_date, status, actual_type")
      .order("local_date")
      .limit(200),
  ]);

  // ---- streaks -----------------------------------------------------------
  // Build one record per calendar day since the block started, so rest days
  // are represented and can be skipped rather than counted as misses.
  let dayRecords: DayRecord[] = [];
  if (programRes.data) {
    const { data: programDays } = await supabase
      .from("program_days")
      .select("day_index, day_type")
      .eq("program_id", programRes.data.id);

    const typeByWeekday = new Map((programDays ?? []).map((d) => [d.day_index, d.day_type]));
    const completedDates = new Set(
      (sessionsRes.data ?? []).filter((s) => s.status === "completed").map((s) => s.local_date),
    );

    const from = programRes.data.started_on > today ? today : programRes.data.started_on;
    dayRecords = dateRange(from, today).map((date) => ({
      localDate: date,
      dayType: typeByWeekday.get(isoWeekday(date)) ?? "rest",
      completed: completedDates.has(date),
    }));
  }
  const streaks = computeStreaks(dayRecords, today);

  // ---- charts ------------------------------------------------------------
  const weights = weightsRes.data ?? [];
  const weightPoints: Point[] = weights.map((w) => ({
    label: shortDate(w.recorded_on),
    value: Number(w.weight_kg),
  }));
  const latestWeight = weights.length ? Number(weights[weights.length - 1].weight_kg) : null;

  // View columns are typed nullable by Supabase's generator, so narrow first.
  const volumeRows = (volumeRes.data ?? []).filter(
    (v): v is typeof v & { local_date: string; volume_kg: number } =>
      v.local_date !== null && v.volume_kg !== null && Number(v.volume_kg) > 0,
  );
  const volumePoints: Point[] = volumeRows
    .slice(-14)
    .map((v) => ({ label: shortDate(v.local_date), value: Number(v.volume_kg) }));

  // Per-lift strength as small multiples: a five-line chart is unreadable on a
  // phone, and each lift is its own question anyway.
  const byExercise = new Map<string, { name: string; points: Point[] }>();
  for (const row of strengthRes.data ?? []) {
    if (!row.exercise_id || !row.local_date || row.best_e1rm === null) continue;
    const entry = byExercise.get(row.exercise_id) ?? {
      name: row.exercise_name ?? "Exercise",
      points: [] as Point[],
    };
    entry.points.push({ label: shortDate(row.local_date), value: Number(row.best_e1rm) });
    byExercise.set(row.exercise_id, entry);
  }
  const strengthCharts = [...byExercise.values()]
    .filter((e) => e.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 6);

  const totalVolume = volumeRows.reduce((n, v) => n + Number(v.volume_kg), 0);
  const hasAnything = weights.length > 0 || volumeRows.length > 0;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">Progress</h1>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <StatTile
          label="Streak"
          value={`${streaks.current}`}
          sub={streaks.current === 1 ? "session" : "sessions in a row"}
        />
        <StatTile label="Best streak" value={`${streaks.longest}`} sub="sessions" />
        <StatTile label="Sessions" value={`${streaks.totalSessions}`} sub="completed" />
        <StatTile
          label="Volume lifted"
          value={totalVolume >= 1000 ? `${Math.round(totalVolume / 1000)}t` : `${Math.round(totalVolume)}kg`}
          sub="all time"
        />
      </section>

      {!hasAnything && (
        <p className="mt-8 rounded-xl border border-dashed border-border px-5 py-6 text-center text-sm text-muted">
          Complete a session or log your weight and the charts will fill in here.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Body weight</h2>
        <p className="mb-3 text-xs text-muted">Weigh in weekly, same time of day.</p>
        <LineChart points={weightPoints} unit="kg" title="Body weight" />
        <LogWeight current={latestWeight} />
      </section>

      {volumePoints.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold">Volume per session</h2>
          <p className="mb-3 text-xs text-muted">
            Reps × weight, totalled across the session.
          </p>
          <BarChart points={volumePoints} unit="kg" title="Volume per session" />
        </section>
      )}

      {strengthCharts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold">Strength by lift</h2>
          <p className="mb-4 text-xs text-muted">
            Estimated one-rep max. Each lift gets its own chart — five lines on one
            axis would be unreadable here.
          </p>
          <div className="space-y-8">
            {strengthCharts.map((e) => (
              <div key={e.name}>
                <h3 className="mb-2 text-sm font-medium">{e.name}</h3>
                <LineChart points={e.points} unit="kg" title={e.name} height={110} />
              </div>
            ))}
          </div>
        </section>
      )}

      <BottomNav active="/progress" />
    </main>
  );
}

import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { BarChart, LineChart, StatTile, type Point } from "@/components/charts";
import { buildDayRecords, computeStreaks } from "@/lib/progress/streaks";
import { buildStrengthChartsFromDescendingRows } from "@/lib/progress/strength-charts";
import { localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { getUnitsPreference, formatVolume, weightLabel } from "@/lib/units";
import type { Database } from "@/lib/database.types";
import { LogWeight } from "./log-weight";

export const dynamic = "force-dynamic";

/** "8 Sep" — short enough for an axis on a 390px screen. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export default async function ProgressPage() {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  // Every query on this screen is independent — none of them needs a value
  // from another — so they all go at once. The profile used to be awaited on
  // its own first, and the program days afterwards, which made three waves of
  // waiting out of one wave of work.
  const [
    profileRes,
    weightsRes,
    volumeRes,
    strengthRes,
    programsRes,
    sessionsRes,
    programDaysRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("timezone, onboarding_completed_at, units_preference")
      .eq("id", user.id)
      .single(),
    // Fetch recent data descending, reverse for processing. NEVER order
    // ascending with a limit: caps at oldest rows, so after 2-3 months the
    // streak drops to 0 and charts stop updating (h1).
    supabase
      .from("body_metrics")
      .select("recorded_on, weight_kg")
      .order("recorded_on", { ascending: false })
      .limit(200),
    supabase
      .from("session_volume")
      .select("local_date, volume_kg, set_count, duration_seconds")
      .order("local_date", { ascending: false })
      .limit(200),
    supabase
      .from("exercise_strength_history")
      .select("exercise_id, exercise_name, local_date, best_e1rm, top_weight_kg")
      .order("local_date", { ascending: false })
      .limit(600),
    // Ordered oldest-first with created_at breaking same-day ties, so
    // buildDayRecords can treat the last match as the newest block.
    supabase
      .from("programs")
      .select("id, started_on, ends_on, created_at")
      .order("started_on")
      .order("created_at"),
    supabase
      .from("sessions")
      .select("local_date, status, actual_type, is_deload")
      .order("local_date", { ascending: false })
      .limit(500),
    supabase.from("program_days").select("program_id, day_index, day_type"),
  ]);

  const profile = profileRes.data;
  if (!profile) redirect("/");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const timezone = resolveTimezoneWithProfile(profile.timezone);
  const today = localDateString(timezone);
  const units = getUnitsPreference(profile.units_preference);

  // ---- streaks -----------------------------------------------------------
  // Across every block, not just the active one: a streak that reset because a
  // new four-week block began would punish the user for our own bookkeeping.
  const programs = (programsRes.data ?? []).map((p) => ({
    id: p.id,
    startedOn: p.started_on,
    endsOn: p.ends_on,
  }));

  const allProgramDays = programDaysRes.data;

  type DayType = Database["public"]["Enums"]["day_type"];
  const dayTypesByProgram: Record<string, Record<number, DayType>> = {};
  for (const d of allProgramDays ?? []) {
    (dayTypesByProgram[d.program_id] ??= {})[d.day_index] = d.day_type;
  }

  const dayRecords = buildDayRecords({
    programs,
    dayTypesByProgram,
    completedSessions: (sessionsRes.data ?? [])
      .filter((s) => s.status === "completed")
      .map((s) => ({ local_date: s.local_date, actual_type: s.actual_type })),
    today,
  });

  const streaks = computeStreaks(dayRecords, today);

  // ---- charts ------------------------------------------------------------
  // Reverse data since it was fetched newest-first for h1 fix
  const weights = [...(weightsRes.data ?? [])].reverse();
  const weightPoints: Point[] = weights.map((w) => {
    const kg = Number(w.weight_kg);
    // Convert to user's preferred units for display
    const displayValue = units === "imperial" ? kg * 2.20462262185 : kg;
    return {
      label: shortDate(w.recorded_on),
      value: displayValue,
    };
  });
  const latestWeight = weights.length ? Number(weights[weights.length - 1].weight_kg) : null;

  // View columns are typed nullable by Supabase's generator, so narrow first.
  const volumeRows = [...(volumeRes.data ?? [])].reverse().filter(
    (v): v is typeof v & { local_date: string; volume_kg: number } =>
      v.local_date !== null && v.volume_kg !== null && Number(v.volume_kg) > 0,
  );
  const volumePoints: Point[] = volumeRows
    .slice(-14)
    .map((v) => {
      const kg = Number(v.volume_kg);
      const displayValue = units === "imperial" ? kg * 2.20462262185 : kg;
      return { label: shortDate(v.local_date), value: displayValue };
    });

  // Per-lift strength as small multiples: a five-line chart is unreadable on a
  // phone, and each lift is its own question anyway. Data is fetched newest-first;
  // the helper reverses it so charts plot chronologically (oldest to newest).
  // B1: Exclude deload weeks from strength charts
  const deloadDates = new Set(
    (sessionsRes.data ?? [])
      .filter(s => s.is_deload === true)
      .map(s => s.local_date)
  );
  const strengthCharts = buildStrengthChartsFromDescendingRows(
    (strengthRes.data ?? []).filter(row => !deloadDates.has(row.local_date)),
    shortDate,
    units
  ).slice(0, 6);

  const totalVolume = volumeRows.reduce((n, v) => n + Number(v.volume_kg), 0);
  const hasAnything = weights.length > 0 || volumeRows.length > 0;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">Progress</h1>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <StatTile
          label="Days in a row"
          value={`${streaks.current}`}
          sub={streaks.current === 1 ? "day" : "days"}
        />
        <StatTile
          label="Best streak"
          value={`${streaks.longest}`}
          sub={streaks.longest === 1 ? "day" : "days"}
        />
        <StatTile label="Days trained" value={`${streaks.totalSessions}`} sub="all time" />
        <StatTile
          label="Volume lifted"
          value={formatVolume(totalVolume, units, "0 kg")}
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
        <LineChart points={weightPoints} unit={weightLabel(units)} title="Body weight" />
        <LogWeight current={latestWeight} />
      </section>

      {volumePoints.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold">Volume per session</h2>
          <p className="mb-3 text-xs text-muted">
            Reps × weight, totalled across the session.
          </p>
          <BarChart points={volumePoints} unit={weightLabel(units)} title="Volume per session" />
        </section>
      )}

      {strengthCharts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold">Strength by lift</h2>
          <p className="mb-4 text-xs text-muted">
            Est. 1RM ({weightLabel(units)}). Each lift gets its own chart — five lines on one
            axis would be unreadable here.
          </p>
          <div className="space-y-8">
            {strengthCharts.map((e) => (
              <div key={e.name}>
                <h3 className="mb-2 text-sm font-medium">{e.name}</h3>
                <LineChart points={e.points} unit={weightLabel(units)} title={e.name} height={110} />
              </div>
            ))}
          </div>
        </section>
      )}

    </main>
  );
}

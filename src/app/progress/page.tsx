import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthedClient } from "@/lib/supabase/auth";
import { BarChart, LineChart, StatTile, type Point } from "@/components/charts";
import { buildDayRecords, computeStreaks } from "@/lib/progress/streaks";
import { buildStrengthChartsFromDescendingRows } from "@/lib/progress/strength-charts";
import { localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import type { Database } from "@/lib/database.types";
import { getUnitsPreference } from "@/lib/units";
import { formatVolumeLifted } from "@/lib/session/format-volume-lifted";
import { LogWeight } from "./log-weight";
import { loadProgramDays } from "@/lib/progress/load-program-days";

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
      .select("timezone, onboarding_completed_at, units, primary_track")
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
    // Ordered oldest-first for building day records
    // Exclude superseded blocks (preserve history only, not used for streaks/charts)
    supabase
      .from("programs")
      .select("id, started_on, ends_on, ended_on, created_at")
      .neq("status", "superseded")
      .order("started_on")
      .order("created_at"),
    supabase
      .from("sessions")
      .select("id, local_date, status, actual_type, is_deload, duration_seconds")
      .order("local_date", { ascending: false })
      .limit(500),
    loadProgramDays(supabase),
  ]);

  const profile = profileRes.data;
  if (!profile) redirect("/");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const timezone = resolveTimezoneWithProfile(profile.timezone);
  const today = localDateString(timezone);
  const units = getUnitsPreference(profile.units);
  const primaryTrack = profile.primary_track;

  // ---- progress summary (days trained, volume) ------------------------
  // Use RPC to avoid 414 URI too long errors (was passing 500+ session IDs in .in())
  // @ts-expect-error - RPC function not in generated types yet
  const { data: progressData, error: progressError } = await supabase.rpc("progress_summary", {
    p_user: user.id,
  });

  const progressQueryFailed = !!progressError;
  if (progressError) {
    console.error("Failed to load progress summary:", progressError);
  }

  type ProgressSummary = {
    days_trained: number;
    local_dates: string[];
    total_volume_kg: number;
    session_count: number;
  };
  const summary = progressData as ProgressSummary | null;
  const totalVolume = progressQueryFailed ? null : (Number(summary?.total_volume_kg) ?? 0);

  // ---- streaks -----------------------------------------------------------
  // Across every block, not just the active one: a streak that reset because a
  // new four-week block began would punish the user for our own bookkeeping.
  const programs = (programsRes.data ?? []).map((p) => ({
    id: p.id,
    startedOn: p.started_on,
    endsOn: p.ends_on,
    endedOn: p.ended_on,
  }));

  const allProgramDays = programDaysRes.data;

  type DayType = Database["public"]["Enums"]["day_type"];
  const dayTypesByProgram: Record<string, Record<number, DayType>> = {};
  for (const d of allProgramDays ?? []) {
    (dayTypesByProgram[d.program_id] ??= {})[d.day_index] = d.day_type;
  }

  // Fetch session_volume to get working set counts for strength sessions
  // Product rule (2026-10-24): strength sessions count toward streaks/days trained
  // ONLY when status = 'completed' AND working_sets >= 1
  const sessionIds = (sessionsRes.data ?? []).map((s) => s.id);

  // Use RPC to get set counts without unbounded .in() filter
  // @ts-expect-error - RPC function not in generated types yet
  const { data: setCountsData, error: setCountsError } = await supabase.rpc("get_session_set_counts", {
    p_user: user.id,
    p_session_ids: sessionIds,
  });
  
  if (setCountsError) {
    console.error("Failed to load session set counts:", setCountsError);
  }

  type SetCountRow = { session_id: string; set_count: number };
  const setCounts = (setCountsData ?? []) as unknown as SetCountRow[];
  const workingSetsBySession = new Map(
    setCounts.map((v) => [
      v.session_id,
      Number(v.set_count) || 0,
    ])
  );

  // Map all sessions with their working set counts
  // countsTowardStreak will enforce the rules (completed + working sets for strength)
  const completedSessions = (sessionsRes.data ?? []).map((s) => ({
    local_date: s.local_date,
    actual_type: s.actual_type,
    status: s.status,
    working_set_count: workingSetsBySession.get(s.id) as number | undefined,
  }));

  const dayRecords = buildDayRecords({
    programs,
    dayTypesByProgram,
    completedSessions,
    today,
  });

  const streaks = computeStreaks(dayRecords, today);

  // ---- charts ------------------------------------------------------------
  // Reverse data since it was fetched newest-first for h1 fix
  const weights = [...(weightsRes.data ?? [])].reverse();
  const weightPoints: Point[] = weights.map((w) => ({
    label: shortDate(w.recorded_on),
    value: Number(w.weight_kg),
  }));
  const latestWeight = weights.length ? Number(weights[weights.length - 1].weight_kg) : null;

  // View columns are typed nullable by Supabase's generator, so narrow first.
  const volumeRows = [...(volumeRes.data ?? [])].reverse().filter(
    (v): v is typeof v & { local_date: string; volume_kg: number } =>
      v.local_date !== null && v.volume_kg !== null && Number(v.volume_kg) > 0,
  );

  // Per-lift strength as small multiples: a five-line chart is unreadable on a
  // phone, and each lift is its own question anyway. Data is fetched newest-first;
  // the helper reverses it so charts plot chronologically (oldest to newest).
  // B1/B2/C2: Include all sessions in charts (deload points marked with isDeload flag)
  // Track dates where ALL sessions are deloads (don't mark a date if ANY session is non-deload)
  const sessionsByDate = new Map<string, Array<{ id: string; isDeload: boolean }>>();
  for (const s of sessionsRes.data ?? []) {
    if (!sessionsByDate.has(s.local_date)) {
      sessionsByDate.set(s.local_date, []);
    }
    sessionsByDate.get(s.local_date)!.push({ id: s.id, isDeload: s.is_deload === true });
  }
  
  const deloadDates = new Set<string>();
  for (const [date, sessions] of sessionsByDate.entries()) {
    // Only mark date as deload if ALL sessions on that date are deloads
    if (sessions.length > 0 && sessions.every(s => s.isDeload)) {
      deloadDates.add(date);
    }
  }
  
  // Volume chart with deload markers (change 7: headline skips deload sessions)
  const volumePoints: Point[] = volumeRows
    .slice(-14)
    .map((v) => ({ 
      label: shortDate(v.local_date), 
      value: Number(v.volume_kg),
      isDeload: deloadDates.has(v.local_date)
    }));
  
  const strengthCharts = buildStrengthChartsFromDescendingRows(
    strengthRes.data ?? [],
    shortDate,
    units,
    deloadDates
  ).slice(0, 6);

  // totalVolume now comes from progress_summary RPC (computed server-side)

  // ---- yoga/breathing stats (QA M-4) ------------------------------------
  // For yoga and breathing members, compute stats from completed sessions
  const isYogaOrBreathing = primaryTrack === "yoga" || primaryTrack === "meditation";
  let yogaStats = null;
  let yogaStatsError = !!sessionsRes.error;
  if (isYogaOrBreathing) {
    if (sessionsRes.error) {
      console.error("Failed to load sessions for yoga stats:", sessionsRes.error);
    } else {
      try {
        const { computeYogaStats } = await import("@/lib/progress/yoga-stats");
        // Filter to completed yoga or breathing sessions
        const yogaBreathingSessions = (sessionsRes.data ?? [])
          .filter((s) => 
            s.status === "completed" && 
            (s.actual_type === "yoga" || s.actual_type === "meditation")
          )
          .map((s) => ({
            local_date: s.local_date,
            duration_seconds: s.duration_seconds,
          }));
        yogaStats = computeYogaStats(yogaBreathingSessions, today);
      } catch (error) {
        console.error("Failed to compute yoga stats:", error);
        yogaStatsError = true;
      }
    }
  }

  // Check if member has any strength data (to decide whether to show volume/strength sections)
  const hasStrengthData = volumeRows.length > 0 || (strengthRes.data ?? []).length > 0;

  // Empty state (K3, QA1 P3): same scope as History. Any completed session of a
  // type History lists counts, whether or not it falls inside a current
  // (non-superseded) program block. streaks.totalSessions is block-scoped, so a
  // strength member whose yoga sessions predate the current plan used to see
  // "No progress data yet" while History listed those sessions.
  const HISTORY_TYPES = new Set(["weights", "bodyweight", "yoga", "meditation"]);
  const hasAnyCompletedSession = (sessionsRes.data ?? []).some(
    (s) => s.status === "completed" && HISTORY_TYPES.has(s.actual_type || "weights"),
  );
  const hasSessionData = hasAnyCompletedSession || hasStrengthData;
  
  const anyLoadError = progressQueryFailed || !!setCountsError || yogaStatsError
    || !!weightsRes.error || !!volumeRes.error || !!strengthRes.error || !!sessionsRes.error;
  
  const showSessionsEmpty = !hasSessionData && !anyLoadError;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">Progress</h1>

      {showSessionsEmpty ? (
        <div className="mt-8 rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <p className="text-sm font-medium text-fg">No progress data yet</p>
          <p className="mt-2 text-sm text-muted">
            Complete your first session to start tracking your progress and see your stats here.
          </p>
          <Link
            href="/today"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Start today&apos;s workout
          </Link>
        </div>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3">
        {isYogaOrBreathing && yogaStats ? (
          <>
            <StatTile
              label="Sessions this week"
              value={yogaStatsError ? "—" : `${yogaStats.sessionsThisWeek}`}
              sub="Mon to today"
            />
            <StatTile
              label="Minutes this week"
              value={yogaStatsError ? "—" : `${yogaStats.minutesThisWeek}`}
              sub="Mon to today"
            />
            <StatTile
              label="Minutes this month"
              value={yogaStatsError ? "—" : `${yogaStats.minutesThisMonth}`}
              sub={new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(today + "T00:00:00Z"))}
            />
            <StatTile
              label="Sessions all time"
              value={yogaStatsError ? "—" : `${yogaStats.sessionsAllTime}`}
              sub="total completed"
            />
          </>
        ) : isYogaOrBreathing ? (
          <>
            <StatTile
              label="Sessions this week"
              value="—"
              sub="Mon to today"
            />
            <StatTile
              label="Minutes this week"
              value="—"
              sub="Mon to today"
            />
            <StatTile
              label="Minutes this month"
              value="—"
              sub={new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(today + "T00:00:00Z"))}
            />
            <StatTile
              label="Sessions all time"
              value="—"
              sub="total completed"
            />
          </>
        ) : (
          <>
            <StatTile
              label="Streak"
              value={progressQueryFailed ? "—" : `${streaks.current}`}
              sub={progressQueryFailed ? "error loading" : (streaks.current === 1 ? "day in a row" : "days in a row")}
            />
            <StatTile
              label="Best streak"
              value={progressQueryFailed ? "—" : `${streaks.longest}`}
              sub={progressQueryFailed ? "error loading" : (streaks.longest === 1 ? "day" : "days")}
            />
            <StatTile 
              label="Days trained" 
              value={progressQueryFailed ? "—" : `${streaks.totalSessions}`} 
              sub={progressQueryFailed ? "error loading" : "all time"} 
            />
            <StatTile
              label="Volume lifted"
              value={
                progressQueryFailed 
                  ? "—"
                  : formatVolumeLifted(totalVolume!, units)
              }
              sub={progressQueryFailed ? "error loading" : "all time"}
            />
          </>
        )}
      </section>
      
      {anyLoadError && (
        <p className="mt-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-4 py-2 text-sm text-[var(--color-danger)]">
          Couldn&apos;t load some stats
        </p>
      )}
      
      {!isYogaOrBreathing && (
        <p className="mt-3 text-xs text-muted">
          Your streak counts scheduled training days you trained. Missing one resets it. Breathe sessions don&apos;t count.
        </p>
      )}

      {(!isYogaOrBreathing || hasStrengthData) && volumePoints.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold">Volume per session</h2>
          <p className="mb-3 text-xs text-muted">
            Reps × weight, totalled across the session.
          </p>
          <BarChart points={volumePoints} unit="kg" title="Volume per session" />
        </section>
      )}

      {(!isYogaOrBreathing || hasStrengthData) && strengthCharts.length > 0 && (
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
                <LineChart points={e.points} unit={e.unitLabel} title={`${e.name} (est. 1RM)`} height={110} />
              </div>
            ))}
          </div>
        </section>
      )}
        </>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Body weight</h2>
        <p className="mb-3 text-xs text-muted">Weigh in weekly, same time of day.</p>
        {weightsRes.error ? (
          <p className="mb-4 rounded-xl border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-5 py-6 text-center text-sm text-[var(--color-danger)]">
            Couldn&apos;t load your weight history. You can still log today&apos;s weight.
          </p>
        ) : weightPoints.length === 0 ? (
          <p className="mb-4 rounded-xl border border-dashed border-border px-5 py-6 text-center text-sm text-muted">
            Log your weight below to start tracking. Weigh-ins on two different days will show a trend.
          </p>
        ) : (
          <LineChart 
            points={weightPoints} 
            unit="kg" 
            title="Body weight"
            singlePointHint="Weigh in on another day to see a trend"
          />
        )}
        <LogWeight current={latestWeight} />
      </section>

    </main>
  );
}

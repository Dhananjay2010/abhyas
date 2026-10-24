import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import {
  INTENTS,
  PREFS_COLUMNS,
  USER_PATTERN_COLUMNS,
  prefsFromRow,
  userPatternFromRow,
  withUserPatterns,
  type Intent,
  type UserPattern,
} from "@/lib/breathing/pattern";
import {
  PROGRESS_COLUMNS,
  progressFromRow,
  resolveJourney,
  type ResolvedJourney,
} from "@/lib/breathing/journey";
import {
  resolveRoutine,
  type ResolvedRoutine,
} from "@/lib/breathing/routine";
import {
  getCachedBreathingPatterns,
  getCachedBreathingRoutines,
  getCachedBreathingJourneys,
} from "@/lib/supabase/cached-queries";
import { getCachedUserTimezone } from "@/lib/supabase/cached-profile";
import { breathingStats, calmShifts, type MoodLog } from "@/lib/breathing/stats";
import { suggestPractice } from "@/lib/breathing/suggest";
import { BreatheHome, type LastPractice } from "./breathe-home";

export const dynamic = "force-dynamic";

/** The hour where the user is, which is the only hour a suggestion should reason about. */
function hourIn(timezone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const n = Number(hour);
  return Number.isFinite(n) ? n % 24 : 12;
}

export default async function BreathePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");
  const search = await searchParams;

  // Only a lower bound, so it does not need the user's timezone and nothing
  // has to wait for the profile. A year is more than any streak worth showing.
  const utcToday = localDateString("UTC");
  const since = addDays(utcToday, -370);

  const [
    builtinPatterns,
    routinesData,
    journeysData,
    timezone,
    mineRes,
    progressRes,
    settingsRes,
    practicesRes,
    logsRes,
    trainingRes,
  ] = await Promise.all([
    getCachedBreathingPatterns(),
    getCachedBreathingRoutines(),
    getCachedBreathingJourneys(),
    getCachedUserTimezone(),
    supabase.from("user_breathing_patterns").select(USER_PATTERN_COLUMNS).order("created_at"),
    supabase.from("user_journey_progress").select(PROGRESS_COLUMNS),
    supabase.from("user_settings").select(PREFS_COLUMNS).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("sessions")
      .select("local_date, duration_seconds")
      .eq("actual_type", "meditation")
      .eq("status", "completed")
      .gte("local_date", since)
      .limit(2000),
    supabase
      .from("breathing_logs")
      .select(
        "pattern_id, user_pattern_id, planned_cycles, pattern_name, routine_id, routine_name, mood_before, mood_after",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("sessions")
      .select("local_date, actual_type")
      .eq("status", "completed")
      .in("actual_type", ["weights", "bodyweight"])
      .gte("local_date", addDays(utcToday, -1))
      .limit(10),
  ]);

  const owned = (mineRes.data ?? [])
    .map(userPatternFromRow)
    .filter((p): p is UserPattern => p !== null);
  const patterns = withUserPatterns(builtinPatterns, owned);

  const routines = routinesData
    .map((routine) => resolveRoutine(routine, patterns))
    .filter((r): r is ResolvedRoutine => r !== null);
  const today = localDateString(timezone);
  const stats = breathingStats(
    (practicesRes.data ?? []).map((s) => ({
      localDate: s.local_date,
      seconds: s.duration_seconds ?? 0,
    })),
    today,
  );

  // Newest first, so the first log seen for a practice is its latest length.
  //
  // A routine's steps are skipped here: their lengths were the routine's
  // choice, not yours, so they must not become the length a practice offers on
  // its own, nor the practice "Again" repeats.
  const logs = logsRes.data ?? [];
  const solo = logs.filter((l) => l.routine_id === null);
  const lastCyclesByPattern: Record<string, number> = {};
  for (const log of solo) {
    const key = log.user_pattern_id ?? log.pattern_id;
    if (key && !(key in lastCyclesByPattern)) lastCyclesByPattern[key] = log.planned_cycles;
  }
  const latest = solo[0];
  const latestKey = latest ? (latest.user_pattern_id ?? latest.pattern_id) : null;
  // A practice of your own is keyed by your row; a built-in by the built-in,
  // even when you have retimed it.
  const lastPattern = latestKey
    ? patterns.find((p) => (p.kind === "mine" ? p.id === latestKey : p.id === latestKey))
    : undefined;
  const last: LastPractice | null =
    lastPattern && latest ? { patternId: lastPattern.id, cycles: latest.planned_cycles } : null;

  const trainedToday = (trainingRes.data ?? []).some((s) => s.local_date === today);
  const suggestion = suggestPractice({
    patterns,
    hour: hourIn(timezone),
    trainedToday,
    excludeId: last?.patternId ?? null,
  });

  // A routine is rated as a whole -- both check-ins sit on its first step --
  // so it is grouped under its own name rather than under that step's practice.
  const shifts = calmShifts(
    logs.map(
      (l): MoodLog => ({
        patternName: l.routine_name ?? l.pattern_name,
        moodBefore: l.mood_before,
        moodAfter: l.mood_after,
      }),
    ),
  );

  // Resolved after the check-ins, because a course may end on a day chosen
  // from them. A course whose practices are not all there is not offered, for
  // the same reason a routine is not.
  const progressByJourney = new Map(
    (progressRes.data ?? []).map((row) => [row.journey_id, row]),
  );
  const journeys = journeysData
    .map((journey) =>
      resolveJourney({
        journey,
        patterns,
        progress: progressFromRow(progressByJourney.get(journey.id) ?? null),
        today,
        shifts,
      }),
    )
    .filter((j): j is ResolvedJourney => j !== null);

  const asked = typeof search.intent === "string" ? search.intent : null;
  const intent = INTENTS.some((i) => i.value === asked) ? (asked as Intent) : null;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <BreatheHome
        patterns={patterns}
        routines={routines}
        journeys={journeys}
        prefs={prefsFromRow(settingsRes.data)}
        stats={stats}
        lastCyclesByPattern={lastCyclesByPattern}
        last={last}
        suggestion={suggestion}
        shifts={shifts}
        intent={intent}
        todayIndex={isoWeekday(today)}
      />
    </main>
  );
}

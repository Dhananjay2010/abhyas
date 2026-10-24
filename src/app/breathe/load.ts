import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  PATTERN_COLUMNS,
  PREFS_COLUMNS,
  USER_PATTERN_COLUMNS,
  isMineSlug,
  mineId,
  patternFromRow,
  patternFromUser,
  prefsFromRow,
  userPatternFromRow,
  withUserPatterns,
  type BreathingPrefs,
  type Pattern,
  type UserPattern,
} from "@/lib/breathing/pattern";
import {
  JOURNEY_COLUMNS,
  PROGRESS_COLUMNS,
  journeyFromRow,
  progressFromRow,
  resolveJourney,
  type ResolvedJourney,
} from "@/lib/breathing/journey";
import {
  ROUTINE_COLUMNS,
  resolveRoutine,
  routineFromRow,
  type ResolvedRoutine,
} from "@/lib/breathing/routine";
import { calmShifts, type MoodLog } from "@/lib/breathing/stats";
import { localDateString } from "@/lib/dates";

type Client = SupabaseClient<Database>;

/** The same window the Breathe tab reads its check-ins over. */
const RATED_LOGS = 200;

/** The last 50 are ample for "how long did I do this one last time". */
const RECENT_LOGS = 50;

type RecentLog = {
  planned_cycles: number;
  pattern_id: string | null;
  user_pattern_id: string | null;
};

/**
 * Find the pattern that matches a log's key (user_pattern_id ?? pattern_id).
 *
 * A practice of your own is keyed by your row; a built-in by the built-in's id,
 * even when you have retimed it. But when you _have_ retimed it, the log stores
 * user_pattern_id (the user_breathing_patterns row), so the lookup must check
 * both p.id (the builtin's id) and p.userPatternId (your timings row).
 */
export function findPatternByLogKey(patterns: Pattern[], logKey: string): Pattern | undefined {
  return patterns.find((p) =>
    p.kind === "mine"
      ? p.id === logKey
      : p.id === logKey || p.userPatternId === logKey,
  );
}

export type LoadedPractice = {
  pattern: Pattern;
  prefs: BreathingPrefs;
  /** The length used last time for this practice, if there was a last time. */
  lastCycles: number | null;
  /** Nothing has ever been practised, so the safety note is due. */
  firstPractice: boolean;
};

/**
 * One practice by the slug in the URL, whichever kind it is.
 *
 * A slug of `mine-<id>` is a practice you made yourself. Anything else is one
 * of ours, with your timings folded in if you have saved any. Both pages that
 * need a practice -- the setup screen and the practice itself -- go through
 * here, so they can never disagree about what a slug means.
 */
export async function loadPractice(
  supabase: Client,
  userId: string,
  slug: string,
): Promise<LoadedPractice | null> {
  const mine = isMineSlug(slug);

  const [builtinRes, mineRes, settingsRes, logsRes, countRes] = await Promise.all([
    mine
      ? Promise.resolve(null)
      : supabase.from("breathing_patterns").select(PATTERN_COLUMNS).eq("slug", slug).maybeSingle(),
    supabase.from("user_breathing_patterns").select(USER_PATTERN_COLUMNS),
    supabase.from("user_settings").select(PREFS_COLUMNS).eq("user_id", userId).maybeSingle(),
    supabase
      .from("breathing_logs")
      .select("planned_cycles, pattern_id, user_pattern_id")
      .order("created_at", { ascending: false })
      .limit(RECENT_LOGS),
    supabase.from("breathing_logs").select("id", { count: "exact", head: true }),
  ]);

  const owned = (mineRes.data ?? [])
    .map(userPatternFromRow)
    .filter((p): p is UserPattern => p !== null);

  let pattern: Pattern | null = null;
  if (mine) {
    const own = owned.find((p) => p.id === mineId(slug) && p.basePatternId === null);
    pattern = own ? patternFromUser(own) : null;
  } else {
    const builtin = builtinRes?.data ? patternFromRow(builtinRes.data) : null;
    pattern = builtin ? withUserPatterns([builtin], owned)[0] : null;
  }
  if (!pattern) return null;

  const logs = (logsRes.data ?? []) as RecentLog[];
  const previous = logs.find((l) =>
    pattern.kind === "mine"
      ? l.user_pattern_id === pattern.id
      : l.pattern_id === pattern.id,
  );

  return {
    pattern,
    prefs: prefsFromRow(settingsRes.data),
    lastCycles: previous?.planned_cycles ?? null,
    firstPractice: (countRes.count ?? 0) === 0,
  };
}

export type LoadedRoutine = {
  resolved: ResolvedRoutine;
  prefs: BreathingPrefs;
  firstPractice: boolean;
};

/**
 * One routine by its slug, with every step's practice already found and its
 * length worked out.
 *
 * The steps are resolved against your own timings, so a routine that says
 * "Coherent, 2 min" still runs for about two minutes if you have retimed
 * Coherent. Null when the routine is unknown or one of its practices is
 * missing -- `resolveRoutine` explains why a partial routine is not offered.
 */
export async function loadRoutine(
  supabase: Client,
  userId: string,
  slug: string,
): Promise<LoadedRoutine | null> {
  const [routineRes, patternsRes, mineRes, settingsRes, countRes] = await Promise.all([
    supabase.from("breathing_routines").select(ROUTINE_COLUMNS).eq("slug", slug).maybeSingle(),
    supabase.from("breathing_patterns").select(PATTERN_COLUMNS).order("sort_order"),
    supabase.from("user_breathing_patterns").select(USER_PATTERN_COLUMNS),
    supabase.from("user_settings").select(PREFS_COLUMNS).eq("user_id", userId).maybeSingle(),
    supabase.from("breathing_logs").select("id", { count: "exact", head: true }),
  ]);

  const routine = routineRes.data ? routineFromRow(routineRes.data) : null;
  if (!routine) return null;

  const builtins = (patternsRes.data ?? [])
    .map((row) => patternFromRow(row))
    .filter((p): p is Pattern => p !== null);
  const owned = (mineRes.data ?? [])
    .map(userPatternFromRow)
    .filter((p): p is UserPattern => p !== null);

  const resolved = resolveRoutine(routine, withUserPatterns(builtins, owned));
  if (!resolved) return null;

  return {
    resolved,
    prefs: prefsFromRow(settingsRes.data),
    firstPractice: (countRes.count ?? 0) === 0,
  };
}

export type LoadedJourney = {
  resolved: ResolvedJourney;
  prefs: BreathingPrefs;
  firstPractice: boolean;
  /** The local date where the user is, which is what "one a day" is counted in. */
  today: string;
};

/**
 * One journey by its slug, with every day's practice found, its length worked
 * out, and where this person is up to.
 *
 * Both pages that need a journey -- the course itself and a day running -- go
 * through here, so they cannot disagree about which day is open. The
 * check-ins are read because the last day is chosen from them; see
 * `bestRated`.
 */
export async function loadJourney(
  supabase: Client,
  userId: string,
  slug: string,
): Promise<LoadedJourney | null> {
  const [journeyRes, patternsRes, mineRes, settingsRes, profileRes, logsRes, countRes] =
    await Promise.all([
      supabase.from("breathing_journeys").select(JOURNEY_COLUMNS).eq("slug", slug).maybeSingle(),
      supabase.from("breathing_patterns").select(PATTERN_COLUMNS).order("sort_order"),
      supabase.from("user_breathing_patterns").select(USER_PATTERN_COLUMNS),
      supabase.from("user_settings").select(PREFS_COLUMNS).eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("timezone").eq("id", userId).single(),
      supabase
        .from("breathing_logs")
        .select("pattern_name, routine_name, mood_before, mood_after")
        .order("created_at", { ascending: false })
        .limit(RATED_LOGS),
      supabase.from("breathing_logs").select("id", { count: "exact", head: true }),
    ]);

  const journey = journeyRes.data ? journeyFromRow(journeyRes.data) : null;
  if (!journey) return null;

  // A second round trip, because it needs the journey's id. Nothing above
  // depends on it, so it is the only thing serialised here.
  const progressRes = await supabase
    .from("user_journey_progress")
    .select(PROGRESS_COLUMNS)
    .eq("journey_id", journey.id)
    .maybeSingle();

  const builtins = (patternsRes.data ?? [])
    .map((row) => patternFromRow(row))
    .filter((p): p is Pattern => p !== null);
  const owned = (mineRes.data ?? [])
    .map(userPatternFromRow)
    .filter((p): p is UserPattern => p !== null);

  const today = localDateString(profileRes.data?.timezone || "Asia/Kolkata");
  const shifts = calmShifts(
    (logsRes.data ?? []).map(
      (l): MoodLog => ({
        patternName: l.routine_name ?? l.pattern_name,
        moodBefore: l.mood_before,
        moodAfter: l.mood_after,
      }),
    ),
  );

  const resolved = resolveJourney({
    journey,
    patterns: withUserPatterns(builtins, owned),
    progress: progressFromRow(progressRes.data),
    today,
    shifts,
  });
  if (!resolved) return null;

  return {
    resolved,
    prefs: prefsFromRow(settingsRes.data),
    firstPractice: (countRes.count ?? 0) === 0,
    today,
  };
}

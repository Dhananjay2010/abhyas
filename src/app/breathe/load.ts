import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  PREFS_COLUMNS,
  USER_PATTERN_COLUMNS,
  isMineSlug,
  mineId,
  patternFromUser,
  prefsFromRow,
  userPatternFromRow,
  withUserPatterns,
  type BreathingPrefs,
  type Pattern,
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
import { calmShifts, type MoodLog } from "@/lib/breathing/stats";
import { localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import {
  getCachedBreathingPatterns,
  getCachedBreathingRoutines,
  getCachedBreathingJourneys,
} from "@/lib/supabase/cached-queries";

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
export const loadPractice = cache(async function loadPractice(
  supabase: Client,
  userId: string,
  slug: string,
): Promise<LoadedPractice | null> {
  const mine = isMineSlug(slug);

  const [builtins, mineRes, settingsRes, logsRes, countRes] = await Promise.all([
    mine ? Promise.resolve([]) : getCachedBreathingPatterns(),
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
    const builtin = builtins.find((p) => p.slug === slug);
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
});

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
  const [routines, builtins, mineRes, settingsRes, countRes] = await Promise.all([
    getCachedBreathingRoutines(),
    getCachedBreathingPatterns(),
    supabase.from("user_breathing_patterns").select(USER_PATTERN_COLUMNS),
    supabase.from("user_settings").select(PREFS_COLUMNS).eq("user_id", userId).maybeSingle(),
    supabase.from("breathing_logs").select("id", { count: "exact", head: true }),
  ]);

  const routine = routines.find((r) => r.slug === slug);
  if (!routine) return null;

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
  const [journeys, builtins, mineRes, progressRes, settingsRes, profileRes, logsRes, countRes] =
    await Promise.all([
      getCachedBreathingJourneys(),
      getCachedBreathingPatterns(),
      supabase.from("user_breathing_patterns").select(USER_PATTERN_COLUMNS),
      supabase.from("user_journey_progress").select(PROGRESS_COLUMNS),
      supabase.from("user_settings").select(PREFS_COLUMNS).eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("timezone").eq("id", userId).single(),
      supabase
        .from("breathing_logs")
        .select("pattern_name, routine_name, mood_before, mood_after")
        .order("created_at", { ascending: false })
        .limit(RATED_LOGS),
      supabase.from("breathing_logs").select("id", { count: "exact", head: true }),
    ]);

  const journey = journeys.find((j) => j.slug === slug);
  if (!journey) return null;

  const owned = (mineRes.data ?? [])
    .map(userPatternFromRow)
    .filter((p): p is UserPattern => p !== null);

  const today = localDateString(resolveTimezoneWithProfile(profileRes.data?.timezone));
  const shifts = calmShifts(
    (logsRes.data ?? []).map(
      (l): MoodLog => ({
        patternName: l.routine_name ?? l.pattern_name,
        moodBefore: l.mood_before,
        moodAfter: l.mood_after,
      }),
    ),
  );

  const progressByJourney = new Map(
    (progressRes.data ?? []).map((row) => [row.journey_id, row]),
  );

  const resolved = resolveJourney({
    journey,
    patterns: withUserPatterns(builtins, owned),
    progress: progressFromRow(progressByJourney.get(journey.id) ?? null),
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

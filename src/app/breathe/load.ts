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

type Client = SupabaseClient<Database>;

/** The last 50 are ample for "how long did I do this one last time". */
const RECENT_LOGS = 50;

type RecentLog = {
  planned_cycles: number;
  pattern_id: string | null;
  user_pattern_id: string | null;
};

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

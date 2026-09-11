import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import { buildCycle, initialCycles } from "@/lib/breathing/engine";
import {
  PATTERN_COLUMNS,
  PREFS_COLUMNS,
  parseSessionSearch,
  patternFromRow,
  prefsFromRow,
} from "@/lib/breathing/pattern";
import { breathingStats } from "@/lib/breathing/stats";
import { BreathingSession } from "./breathing-session";

export const dynamic = "force-dynamic";

/**
 * The practice itself. Its own route, so it has no tab bar (the nav is an
 * allowlist and this path is not on it) and the back button has somewhere
 * sensible to be (B5, B6).
 */
export default async function PracticeSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  // Enough to cover this week in any timezone, for the strip on the ending.
  const since = addDays(localDateString("UTC"), -8);

  const [patternRes, settingsRes, profileRes, weekRes] = await Promise.all([
    supabase.from("breathing_patterns").select(PATTERN_COLUMNS).eq("slug", slug).maybeSingle(),
    supabase.from("user_settings").select(PREFS_COLUMNS).eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", user.id).single(),
    supabase
      .from("sessions")
      .select("local_date, duration_seconds")
      .eq("actual_type", "meditation")
      .eq("status", "completed")
      .gte("local_date", since),
  ]);

  const pattern = patternRes.data ? patternFromRow(patternRes.data) : null;
  if (!pattern) notFound();

  const prefs = prefsFromRow(settingsRes.data);
  const cycle = buildCycle(pattern.phases);
  const options = parseSessionSearch(search, prefs, {
    fallbackCycles: initialCycles({
      cycle,
      maxCycles: pattern.maxCycles,
      defaultCycles: pattern.defaultCycles,
      preferredMinutes: prefs.defaultMinutes,
      lastCycles: null,
    }),
    maxCycles: pattern.maxCycles,
    cycleSeconds: cycle.seconds,
  });

  const today = localDateString(profileRes.data?.timezone || "Asia/Kolkata");
  const stats = breathingStats(
    (weekRes.data ?? []).map((s) => ({ localDate: s.local_date, seconds: s.duration_seconds ?? 0 })),
    today,
  );

  return (
    <BreathingSession
      pattern={pattern}
      options={options}
      week={{ days: stats.weekDays, seconds: stats.weekSeconds }}
      todayIndex={isoWeekday(today)}
      homeHref="/breathe"
    />
  );
}

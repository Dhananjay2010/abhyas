import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import { parseSessionSearch } from "@/lib/breathing/pattern";
import { breathingStats } from "@/lib/breathing/stats";
import { loadRoutine } from "../../../load";
import { BreathingSession } from "../../../[slug]/session/breathing-session";

export const dynamic = "force-dynamic";

/**
 * A routine, running. The same player as a single practice, handed the whole
 * sequence: it runs each step in turn and records them into one session.
 *
 * Its own route for the same reason the single practice has one -- no tab bar
 * (the nav is an allowlist and this path is not on it), and a back button with
 * somewhere sensible to be.
 */
export default async function RoutineSessionPage({
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

  const [loaded, profileRes, weekRes] = await Promise.all([
    loadRoutine(supabase, user.id, slug),
    supabase.from("profiles").select("timezone").eq("id", user.id).single(),
    supabase
      .from("sessions")
      .select("local_date, duration_seconds")
      .eq("actual_type", "meditation")
      .eq("status", "completed")
      .gte("local_date", since),
  ]);
  if (!loaded) notFound();

  const { resolved, prefs } = loaded;
  // Only the sound and check-in options are read from the URL. Each step's
  // length comes from the routine, so `cycles` here is a placeholder the
  // player replaces per step.
  const options = parseSessionSearch(search, prefs, {
    fallbackCycles: 1,
    maxCycles: 1,
    cycleSeconds: resolved.steps[0].cycle.seconds,
  });

  const today = localDateString(profileRes.data?.timezone || "Asia/Kolkata");
  const stats = breathingStats(
    (weekRes.data ?? []).map((s) => ({ localDate: s.local_date, seconds: s.duration_seconds ?? 0 })),
    today,
  );

  return (
    <BreathingSession
      run={{ routine: resolved.routine, steps: resolved.steps }}
      options={options}
      week={{ days: stats.weekDays, seconds: stats.weekSeconds }}
      todayIndex={isoWeekday(today)}
      homeHref="/breathe"
    />
  );
}

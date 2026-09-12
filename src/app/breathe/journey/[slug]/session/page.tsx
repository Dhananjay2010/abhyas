import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import { journeyHref } from "@/lib/breathing/journey";
import { parseSessionSearch } from "@/lib/breathing/pattern";
import { breathingStats } from "@/lib/breathing/stats";
import { loadJourney } from "../../../load";
import { BreathingSession } from "../../../[slug]/session/breathing-session";

export const dynamic = "force-dynamic";

/**
 * One day of a course, running.
 *
 * The ordinary practice player, handed the day's practice and told which day
 * it is. The day is counted on the way out, not here.
 *
 * Which day may run is decided on the server rather than taken from the URL: a
 * day that is done can be run again (a reload right after finishing one lands
 * here, and repeating a day is allowed -- it simply counts nothing), but a day
 * that is still ahead cannot be jumped to.
 */
export default async function JourneySessionPage({
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

  const [loaded, weekRes] = await Promise.all([
    loadJourney(supabase, user.id, slug),
    supabase
      .from("sessions")
      .select("local_date, duration_seconds")
      .eq("actual_type", "meditation")
      .eq("status", "completed")
      .gte("local_date", since),
  ]);
  if (!loaded) notFound();

  const { resolved, prefs, today: localDate } = loaded;
  const asked = Number(Array.isArray(search.day) ? search.day[0] : search.day);
  const day = resolved.days.find((d) => d.number === asked);
  if (!day || day.state === "tomorrow" || day.state === "ahead") {
    redirect(journeyHref(resolved.journey.slug));
  }

  const options = parseSessionSearch(search, prefs, {
    fallbackCycles: day.cycles,
    maxCycles: day.pattern.maxCycles,
    cycleSeconds: day.cycle.seconds,
  });

  const stats = breathingStats(
    (weekRes.data ?? []).map((s) => ({ localDate: s.local_date, seconds: s.duration_seconds ?? 0 })),
    localDate,
  );

  return (
    <BreathingSession
      pattern={day.pattern}
      // The course sets the length, not the URL, for the same reason a routine
      // step does: a day of the course is the day the course describes.
      options={{ ...options, cycles: day.cycles }}
      journey={{
        id: resolved.journey.id,
        name: resolved.journey.name,
        day: day.number,
        dayCount: resolved.days.length,
        title: day.day.title,
      }}
      week={{ days: stats.weekDays, seconds: stats.weekSeconds }}
      todayIndex={isoWeekday(localDate)}
      homeHref={journeyHref(resolved.journey.slug)}
    />
  );
}

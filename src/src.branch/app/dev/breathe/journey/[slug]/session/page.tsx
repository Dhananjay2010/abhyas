import { notFound } from "next/navigation";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import { buildCycle } from "@/lib/breathing/engine";
import { parseSessionSearch } from "@/lib/breathing/pattern";
import { breathingStats } from "@/lib/breathing/stats";
import { JOURNEY, PREFS, fixtureJourney } from "../../../fixture";
import { SessionPreview } from "../../../previews";

/**
 * Development-only harness for one day of the course running: the real player,
 * handed the day's practice, with saving and the day count stubbed.
 *
 *   /dev/breathe/journey/foundations/session?day=4&speed=8
 *     day four at eight times the pace -- start to ending in a few seconds
 *
 *   ?counted=0  the day answers "already counted today", which is what a
 *               repeat of a day gets
 *   ?fail=1     the practice's own save fails, so the day is never counted
 *   plus every option the real URL carries: sound, amb, vol, lang, count, vib,
 *   settle, checkin
 */
export const dynamic = "force-dynamic";

export default async function DevJourneySessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { slug } = await params;
  const search = await searchParams;
  if (slug !== JOURNEY.slug) notFound();

  const today = localDateString("Asia/Kolkata");
  const asked = Number(search.day);
  const number = Number.isInteger(asked) ? asked : 4;
  // Resolved with every earlier day behind it, so the day asked for is the
  // open one and its practice is the one the course would run.
  const resolved = fixtureJourney({ daysCompleted: number - 1, today });
  const day = resolved?.days.find((d) => d.number === number);
  if (!day) notFound();

  // Shortening every phase keeps the practice's shape while running it in
  // seconds, the same trick the routine harness uses.
  const speed = Math.min(20, Math.max(1, Number(search.speed) || 1));
  const phases = day.pattern.phases.map((p) => ({ ...p, seconds: p.seconds / speed }));
  const pattern = { ...day.pattern, phases };

  const options = parseSessionSearch(search, PREFS, {
    fallbackCycles: day.cycles,
    maxCycles: pattern.maxCycles,
    cycleSeconds: buildCycle(phases).seconds,
  });

  const stats = breathingStats([{ localDate: addDays(today, -1), seconds: 300 }], today);

  return (
    <SessionPreview
      pattern={pattern}
      options={{ ...options, cycles: day.cycles }}
      journey={{
        id: JOURNEY.id,
        name: JOURNEY.name,
        day: day.number,
        dayCount: JOURNEY.days.length,
        title: day.day.title,
      }}
      week={{ days: stats.weekDays, seconds: stats.weekSeconds }}
      todayIndex={isoWeekday(today)}
      failFirst={search.fail === "1"}
      dayCounted={search.counted !== "0"}
    />
  );
}

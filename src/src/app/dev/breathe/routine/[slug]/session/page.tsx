import { notFound } from "next/navigation";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import { parseSessionSearch } from "@/lib/breathing/pattern";
import { breathingStats } from "@/lib/breathing/stats";
import { PREFS, ROUTINES } from "../../../fixture";
import { SessionPreview } from "../../../previews";

/**
 * Development-only harness for a routine running: the real player, handed the
 * whole sequence, with saving stubbed.
 *
 *   /dev/breathe/routine/quick/session?speed=8
 *     the two-step routine at eight times the pace -- the fastest way to watch
 *     a step end, the hand-off appear, the next step start, and the ending
 *     summarise the whole routine
 *
 *   ?fail=1   the first step's save fails, so the ending reports it
 *   plus every option the real URL carries: sound, amb, vol, lang, count, vib,
 *   settle, checkin
 */
export const dynamic = "force-dynamic";

export default async function DevRoutineSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { slug } = await params;
  const search = await searchParams;
  const resolved = ROUTINES.find((r) => r.routine.slug === slug);
  if (!resolved) notFound();

  // Shortening every phase shortens every step, so the sequence keeps its
  // shape while running in seconds.
  const speed = Math.min(20, Math.max(1, Number(search.speed) || 1));
  const steps = resolved.steps.map((s) => ({
    ...s,
    pattern: {
      ...s.pattern,
      phases: s.pattern.phases.map((p) => ({ ...p, seconds: p.seconds / speed })),
    },
  }));

  const options = parseSessionSearch(search, PREFS, {
    fallbackCycles: 1,
    maxCycles: 1,
    cycleSeconds: steps[0].cycle.seconds,
  });

  const today = localDateString("Asia/Kolkata");
  const stats = breathingStats([{ localDate: addDays(today, -1), seconds: 300 }], today);

  return (
    <SessionPreview
      run={{ routine: resolved.routine, steps }}
      options={options}
      week={{ days: stats.weekDays, seconds: stats.weekSeconds }}
      todayIndex={isoWeekday(today)}
      failFirst={search.fail === "1"}
    />
  );
}

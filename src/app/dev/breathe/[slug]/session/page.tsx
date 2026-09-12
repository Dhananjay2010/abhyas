import { notFound } from "next/navigation";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import { buildCycle, initialCycles } from "@/lib/breathing/engine";
import { parseSessionSearch } from "@/lib/breathing/pattern";
import { breathingStats } from "@/lib/breathing/stats";
import { PRACTICES, PREFS } from "../../fixture";
import { SessionPreview } from "../../previews";

/**
 * Development-only harness for the practice screen: the real component, the
 * real URL options, stubbed saving.
 *
 *   ?speed=8    divide every phase by 8, so a whole practice can be watched
 *   ?fail=1     the first save fails, to exercise "Try again"
 *   plus every option the real URL carries: cycles, sound, amb, vol, lang,
 *   count, vib, settle, checkin
 */
export const dynamic = "force-dynamic";

export default async function DevPracticeSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { slug } = await params;
  const search = await searchParams;
  const base = PRACTICES.find((p) => p.slug === slug);
  if (!base) notFound();

  const speed = Math.min(20, Math.max(1, Number(search.speed) || 1));
  const pattern = { ...base, phases: base.phases.map((p) => ({ ...p, seconds: p.seconds / speed })) };
  const cycle = buildCycle(pattern.phases);
  const options = parseSessionSearch(search, PREFS, {
    fallbackCycles: initialCycles({
      cycle,
      maxCycles: pattern.maxCycles,
      defaultCycles: pattern.defaultCycles,
      preferredMinutes: PREFS.defaultMinutes,
      lastCycles: null,
    }),
    maxCycles: pattern.maxCycles,
    cycleSeconds: cycle.seconds,
  });

  const today = localDateString("Asia/Kolkata");
  const stats = breathingStats([{ localDate: addDays(today, -1), seconds: 300 }], today);

  return (
    <SessionPreview
      pattern={pattern}
      options={options}
      week={{ days: stats.weekDays, seconds: stats.weekSeconds }}
      todayIndex={isoWeekday(today)}
      failFirst={search.fail === "1"}
    />
  );
}

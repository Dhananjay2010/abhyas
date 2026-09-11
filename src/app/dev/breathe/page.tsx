import { notFound } from "next/navigation";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import { INTENTS, type Intent } from "@/lib/breathing/pattern";
import { breathingStats } from "@/lib/breathing/stats";
import { PATTERNS, PREFS } from "./fixture";
import { HomePreview } from "./previews";

/**
 * Development-only harness for the Breathe tab, mounting the real components.
 *
 *   /dev/breathe            someone with a little history
 *   /dev/breathe?fresh=1    someone who has never practised
 */
export const dynamic = "force-dynamic";

export default async function DevBreathePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const search = await searchParams;
  const fresh = search.fresh === "1";
  const today = localDateString("Asia/Kolkata");

  const stats = breathingStats(
    fresh
      ? []
      : [
          { localDate: addDays(today, -1), seconds: 300 },
          { localDate: addDays(today, -2), seconds: 180 },
          { localDate: addDays(today, -3), seconds: 600 },
        ],
    today,
  );
  const asked = typeof search.intent === "string" ? search.intent : null;
  const intent = INTENTS.some((i) => i.value === asked) ? (asked as Intent) : null;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <HomePreview
        patterns={PATTERNS}
        prefs={PREFS}
        stats={stats}
        last={fresh ? null : { patternId: PATTERNS[0].id, cycles: 11 }}
        lastCyclesByPattern={fresh ? {} : { [PATTERNS[0].id]: 11 }}
        intent={intent}
        todayIndex={isoWeekday(today)}
      />
    </main>
  );
}

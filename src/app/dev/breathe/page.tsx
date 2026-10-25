import { notFound } from "next/navigation";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import { INTENTS, type Intent } from "@/lib/breathing/pattern";
import { breathingStats, calmShifts, type MoodLog } from "@/lib/breathing/stats";
import { suggestPractice } from "@/lib/breathing/suggest";
import type { ResolvedJourney } from "@/lib/breathing/journey";
import { PRACTICES, PREFS, ROUTINES, fixtureJourney } from "./fixture";
import { HomePreview } from "./previews";

/**
 * Development-only harness for the Breathe tab, mounting the real components.
 *
 *   /dev/breathe            someone with a little history
 *   /dev/breathe?fresh=1    someone who has never practised
 *   /dev/breathe?hour=22    pretend it is late, for the suggestion
 *   /dev/breathe?trained=1  pretend today was a training day
 *   /dev/breathe?days=0     the course, this many days in (0-7)
 *   /dev/breathe?doneToday=1  today's day of the course is already counted
 */
export const dynamic = "force-dynamic";

const RATED: MoodLog[] = [
  { patternName: "Box Breathing", moodBefore: 2, moodAfter: 4 },
  { patternName: "Box Breathing", moodBefore: 3, moodAfter: 5 },
  { patternName: "Box Breathing", moodBefore: null, moodAfter: 4 },
  { patternName: "4-7-8 Breathing", moodBefore: 1, moodAfter: 4 },
  { patternName: "4-7-8 Breathing", moodBefore: 2, moodAfter: 4 },
];

export default async function DevBreathePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const search = await searchParams;
  const fresh = search.fresh === "1";
  const today = localDateString("Asia/Kolkata");
  const askedHour = Number(search.hour);
  const hour = Number.isFinite(askedHour) ? askedHour : 15;

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
  const last = fresh ? null : { patternId: PRACTICES[0].id, cycles: 11 };
  const shifts = fresh ? [] : calmShifts(RATED);

  const askedDays = Number(search.days);
  const journey = fixtureJourney({
    daysCompleted: fresh ? 0 : Number.isInteger(askedDays) ? askedDays : 3,
    doneToday: search.doneToday === "1",
    today,
    shifts,
  });

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <HomePreview
        patterns={PRACTICES}
        routines={ROUTINES}
        journeys={[journey].filter((j): j is ResolvedJourney => j !== null)}
        prefs={PREFS}
        stats={stats}
        last={last}
        lastCyclesByPattern={fresh ? {} : { [PRACTICES[0].id]: 11 }}
        suggestion={suggestPractice({
          patterns: PRACTICES,
          hour,
          trainedToday: search.trained === "1",
          excludeId: last?.patternId ?? null,
        })}
        shifts={shifts}
        intent={intent}
        todayIndex={isoWeekday(today)}
      />
    </main>
  );
}

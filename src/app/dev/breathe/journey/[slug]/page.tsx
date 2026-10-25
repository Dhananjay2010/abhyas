import { notFound } from "next/navigation";
import { localDateString } from "@/lib/dates";
import { calmShifts, type MoodLog } from "@/lib/breathing/stats";
import { JOURNEY, PREFS, fixtureJourney } from "../../fixture";
import { JourneyPreview } from "../../previews";

/**
 * Development-only harness for the course screen.
 *
 *   /dev/breathe/journey/foundations          three days in, today's day open
 *   ?days=0                                   not started
 *   ?days=7                                   finished
 *   ?doneToday=1                              today's day already counted
 *   ?rated=0                                  no check-ins, so day seven falls back
 *   ?fresh=1                                  never practised: the safety note shows
 */
export const dynamic = "force-dynamic";

/** Enough check-ins for `bestRated` to have an answer: Bhramari wins on average. */
const RATED: MoodLog[] = [
  { patternName: "Box Breathing", moodBefore: 2, moodAfter: 4 },
  { patternName: "Box Breathing", moodBefore: 3, moodAfter: 4 },
  { patternName: "Bhramari", moodBefore: 2, moodAfter: 5 },
  { patternName: "Bhramari", moodBefore: 3, moodAfter: 5 },
  // Kapalabhati rates highest of all and must still never be chosen: a course
  // cannot drop anyone past its safety confirmation.
  { patternName: "Kapalabhati", moodBefore: 3, moodAfter: 5 },
  { patternName: "Kapalabhati", moodBefore: 4, moodAfter: 5 },
];

export default async function DevJourneyPage({
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

  const askedDays = Number(search.days);
  const resolved = fixtureJourney({
    daysCompleted: Number.isInteger(askedDays) ? askedDays : 3,
    doneToday: search.doneToday === "1",
    today: localDateString("Asia/Kolkata"),
    shifts: search.rated === "0" ? [] : calmShifts(RATED),
  });
  if (!resolved) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <JourneyPreview resolved={resolved} prefs={PREFS} firstPractice={search.fresh === "1"} />
    </main>
  );
}

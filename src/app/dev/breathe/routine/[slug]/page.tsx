import { notFound } from "next/navigation";
import { PREFS, ROUTINES } from "../../fixture";
import { RoutineSetupPreview } from "../../previews";

/**
 * Development-only harness for a routine's setup screen.
 *
 *   /dev/breathe/routine/quick   the two-step routine that runs in seconds
 *   ?fresh=1                     never practised anything: the safety note shows
 */
export const dynamic = "force-dynamic";

export default async function DevRoutinePage({
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

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <RoutineSetupPreview
        resolved={resolved}
        prefs={PREFS}
        firstPractice={search.fresh === "1"}
      />
    </main>
  );
}
